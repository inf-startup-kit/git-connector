import { EventEmitter } from "events";
import { IConnectorGitSourceConfig, IConnectorSource, IConnectorSourceEvent } from "../interfaces";
import { ILoggerEventEmitter } from "logger-event-emitter";
import { CronJob } from "cron";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as rimraf from "rimraf";
import md5File from "md5-file";
import clone from "clone";
import { execSync } from "child_process";
import { getByteSize } from "../../tools/get_byte_size";
import { randomInt } from "../../tools/random-int";
import { getFilesList } from "../../tools/get_files_list";

export class ConnectorGitSource extends EventEmitter implements IConnectorSource {

    private _current_commit_count: number;
    private _server_str: string;
    private readonly _full_tmp_folder_path: string;
    private readonly _full_target_folder_path: string;
    private readonly _max_file_size: number;
    private _running_sync_flag: boolean;
    private readonly _job: CronJob;
    private readonly _include_regexps: RegExp[];
    private readonly _exclude_regexps: RegExp[];
    private readonly _hash_file_list: {
        [key: string]: {
            path: string
            hash: string
            id: string
        }
    };

    constructor (
        private readonly _id: string,
        private readonly _config: IConnectorGitSourceConfig,
        private readonly _logger: ILoggerEventEmitter
    ) {

        super();

        try { 
            execSync("git --version",  {stdio:[]});
        } catch (error) {
            this._logger.fatal(`Can not exec command ${chalk.red("git --version")}, error: ${error}`);
            process.exit(1);
        }

        this._current_commit_count = 0;
        this._running_sync_flag = false;
        this._include_regexps = [];
        this._exclude_regexps = [];
        this._hash_file_list = {};
        this._max_file_size = getByteSize(this._config.size);
        this._server_str = this._config.repository.replace(/\/\/.*:.*@/gi, "//");
        this._full_tmp_folder_path = path.resolve(process.cwd(), `${this._config.tmp.replace(/(\/|\\)$/,"")}/${this._id}`);
        this._full_target_folder_path = path.resolve(this._full_tmp_folder_path, this._config.target_folder.replace(/^\//,""));

        for (const regexp_text of this._config.exclude_regexp) {
            const regexp = new RegExp(regexp_text, "i");
            this._exclude_regexps.push(regexp);
        }

        for (const regexp_text of this._config.include_regexp) {
            const regexp = new RegExp(regexp_text, "i");
            this._include_regexps.push(regexp);
        }

        if (fs.existsSync(this._full_tmp_folder_path) === true) {
            rimraf.sync(this._full_tmp_folder_path);
            this._logger.debug(`Delete old repository folder ${chalk.gray(this._full_tmp_folder_path)}`);
        }

        this._job = new CronJob(this._config.cron.interval, async () => {
            
            const diff = this._job.nextDate().valueOf() - Date.now();
            let jitter = randomInt(0, this._config.cron.jitter) * 1000;

            if (jitter > diff) {
                jitter = diff - 100;
            }

            setTimeout( () => {
                this._sync();
            }, jitter);

        }, null, false, this._config.cron.time_zone);

        this._logger.debug(`Source type ${chalk.gray(this._config.type)} created`);

    }

    async run (): Promise<void> {
        if (this._config.cron.enable === true) {
            this._job.start();
        }
        this._logger.debug(`Source type ${chalk.gray(this._config.type)} running`);
        this._sync();
    }

    async close (): Promise<void> {
        if (this._config.cron.enable === true) {
            this._job.stop();
        }
        this._logger.debug(`Source type ${chalk.gray(this._config.type)} closed`);
    }

    private async _sync (): Promise<void> {

        if (this._running_sync_flag === true) {
            return;
        }

        this._running_sync_flag = true;

        let repository_change_flag = false;

        if (this._current_commit_count >= this._config.commit_count) {
            if (fs.existsSync(this._full_tmp_folder_path) === true) {
                rimraf.sync(this._full_tmp_folder_path);
                this._logger.debug(`Delete repository folder ${chalk.gray(this._full_tmp_folder_path)}, reach commits limit`);
            }
            this._current_commit_count = 0;
        }

        if (fs.existsSync(this._full_tmp_folder_path) === false) {

            const git_command = `git clone --single-branch --branch ${this._config.branch} --depth 1 ${this._config.repository} ${this._full_tmp_folder_path}`;

            try {

                execSync(git_command, {stdio:[]});
                this._logger.debug(`Repository ${chalk.gray(this._server_str)} cloned to ${chalk.gray(this._full_tmp_folder_path)}`);

                this._current_commit_count += 1;

                repository_change_flag = true;

            } catch (error) {

                this._logger.error(`Error cloning repository ${chalk.red(this._server_str)}`);
                this._logger.debug(error.message.replace(/:\/\/.*@/,"://xxxxx:xxxxx@"));
                this._logger.trace(error.stack.replace(/:\/\/.*@/,"://xxxxx:xxxxx@"));
                
                if (fs.existsSync(this._full_tmp_folder_path)) {
                    rimraf.sync(this._full_tmp_folder_path);
                    this._logger.debug(`Repository folder ${chalk.gray(this._full_tmp_folder_path)}`);
                }

                this._current_commit_count = 0;

            }

        } else {

            try {

                const stdout = execSync("git pull", {
                    cwd: this._full_tmp_folder_path,
                    stdio:[]
                });

                if (!/(Already up to date|Already up-to-date)/gi.test(stdout.toString())) {
                    repository_change_flag = true;
                    this._current_commit_count += 1;
                    this._logger.debug(`Repository ${chalk.gray(this._server_str)} has been updated. Changes accepted.`);
                }

            } catch (error) {
                repository_change_flag = false;
                this._logger.error(`Git pull repository ${chalk.red(this._server_str)} error.`);
                this._logger.debug(error.message.replace(/:\/\/.*@/,"://xxxxx:xxxxx@"));
                this._logger.trace(error.stack.replace(/:\/\/.*@/,"://xxxxx:xxxxx@"));
                rimraf.sync(this._full_tmp_folder_path);
                this._logger.debug(`Repository folder ${chalk.gray(this._full_tmp_folder_path)}`);
            }

        }

        const event_list: IConnectorSourceEvent[] = [];
        const current_hash_list = clone(this._hash_file_list);
        
        if (repository_change_flag === true) {

            this._logger.debug("Scanning...");

            try {

                const files = await getFilesList(this._full_target_folder_path);
    
                for (const file_path of files) {
                    
                    if (file_path.includes(".git") === true) {
                        continue;
                    }

                    const id = file_path.replace(this._full_target_folder_path, "").replace(/^(\/|\\)/,"").replace(/(\\|\\\\)/g, "/");
                    const stat = await fs.promises.stat(file_path);

                    if (stat.size > this._max_file_size) {
                        this._logger.warn(`File ${chalk.yellow(file_path)} ID ${chalk.yellow(id)} size ${chalk.yellow(`${stat.size}b`)} is more than ${chalk.yellow(this._config.size)} limit`);
                        continue;
                    }
    
                    let exclude_flag = false;
                    let include_flag = false;
    
                    for (const regexp of this._exclude_regexps) {
                        if (regexp.test(id) === true) {
                            exclude_flag = true;
                            continue;
                        }
                    }
    
                    if (exclude_flag === true) {
                        this._logger.debug(`File ${chalk.gray(file_path)} ID ${chalk.gray(id)} excluded`);
                        continue;
                    }
    
                    for (const regexp of this._include_regexps) {
                        if (regexp.test(id) === true) {
                            include_flag = true;
                            continue;
                        }
                    }
    
                    if (include_flag === false) {
                        this._logger.debug(`File ${chalk.gray(file_path)} ID ${chalk.gray(id)} not included`);
                        continue;
                    }
    
                    const new_hash = await md5File(file_path);
                                
                    if (current_hash_list[file_path] === undefined) {
    
                        this._logger.debug(`Found new file ${chalk.grey(file_path)}`);
    
                        event_list.push({
                            type: "add",
                            id: id,
                            path: file_path,
                            hash: new_hash
                        });

                        this._hash_file_list[file_path] = {
                            id: id,
                            path: file_path,
                            hash: new_hash
                        };
    
                        continue;
                    }
    
                    const current_hash = current_hash_list[file_path].hash;
    
                    delete current_hash_list[file_path];
    
                    if (current_hash !== new_hash) {
    
                        this._logger.debug(`File ${chalk.grey(file_path)} changed (${current_hash} -> ${new_hash})`);
    
                        this._hash_file_list[file_path].hash = new_hash;
    
                        event_list.push({
                            type: "add",
                            id: this._hash_file_list[file_path].id,
                            path: file_path,
                            hash: new_hash
                        });
    
                    }
    
                }
    
                for (const file_path in current_hash_list) {
    
                    const old_hash = current_hash_list[file_path].hash;
                    const id = current_hash_list[file_path].id;
    
                    event_list.push({
                        type: "delete",
                        id: id,
                        path: file_path,
                        hash: old_hash
                    });

                    delete this._hash_file_list[file_path];
    
                }
    
            } catch (error) {
                this._logger.error(`Scanning Error. Error: ${error.message}`);
                this._logger.trace(error.stack);
            }
        }

        if (event_list.length > 0) {
            this.emit("add", event_list);
        }

        this._running_sync_flag = false;

    }

}