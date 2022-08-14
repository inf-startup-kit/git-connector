import { IConnector, IConnectorConfig, IConnectorSource } from "./interfaces";
import { ILoggerEventEmitter } from "logger-event-emitter";
import { ConnectorSource } from "./lib/source";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import * as rimraf from "rimraf";

export class Connector implements IConnector {

    private readonly _source: IConnectorSource;
    private _running_flag: boolean;

    constructor (
        id: string,
        private readonly _config: IConnectorConfig, 
        private readonly _logger: ILoggerEventEmitter
    ) {

        this._running_flag = false;

        this._source = new ConnectorSource(id, this._config.source, this._logger.child(`${this._logger.name}:source`));

        const full_destination_folder = path.resolve(process.cwd(), this._config.destination_folder);

        if (fs.existsSync(full_destination_folder) === true) {
            if (this._config.recreate_destination_folder === true) {
                rimraf.sync(full_destination_folder);
                this._logger.debug(`Old folder ${chalk.cyan(full_destination_folder)} deleted`);
                fs.mkdirSync(full_destination_folder, {
                    recursive: true
                });
                this._logger.debug(`Folder ${chalk.cyan(full_destination_folder)} created`);
            }
        } else {
            fs.mkdirSync(full_destination_folder, {
                recursive: true
            });
            this._logger.debug(`Folder ${chalk.cyan(full_destination_folder)} created`);
        }      

        this._source.on("add", async (file_path: string, full_file_path: string) => {

            const full_destination_file_path = path.resolve(full_destination_folder, file_path);
            const full_destination_dirname_path = path.dirname(full_destination_file_path);

            try {
                await fs.promises.access(full_destination_dirname_path, fs.constants.R_OK | fs.constants.W_OK);
            } catch {
                fs.mkdirSync(full_destination_dirname_path, {
                    recursive: true
                });
            }

            const stat = await fs.promises.stat(full_destination_dirname_path);

            if (stat.isDirectory() === false) {
                this._logger.error(`Path ${chalk.red(full_destination_dirname_path)} `);
                return;
            }

            try {
                await fs.promises.copyFile(full_file_path, full_destination_file_path);
                this._logger.debug(`File ${chalk.cyan(full_file_path)} copied to ${chalk.cyan(full_destination_file_path)}`);
            } catch (error) {
                this._logger.error(`Error copy file ${chalk.red(full_file_path)} to ${chalk.red(full_destination_file_path)}. Error: ${chalk.red(error.message)}`);
                this._logger.trace(error.stack);
            }
            
        });

        this._source.on("delete", async (file_path: string) => {

            const full_destination_file_path = path.resolve(full_destination_folder, file_path);

            try {
                await fs.promises.access(full_destination_file_path, fs.constants.R_OK | fs.constants.W_OK);
            } catch {
                return;
            }

            try {
                await fs.promises.unlink(full_destination_file_path);
                this._logger.debug(`File ${chalk.cyan(full_destination_file_path)} deleted`);
            } catch (error) {
                this._logger.error(`Error deleting file ${chalk.red(full_destination_file_path)} to ${chalk.red(full_destination_file_path)}. Error: ${chalk.red(error.message)}`);
                this._logger.trace(error.stack);
            }
        });

    }

    async run (): Promise<void> {
        if (this._running_flag === true && this._config.enable === true) {
            return;
        }
        this._running_flag = true;

        await this._source.run();

        this._logger.info(`Connector ${chalk.cyan(this._config.description)} running`);
    }

    async close (): Promise<void> {
        if (this._running_flag === false && this._config.enable === true) {
            return;
        }
        this._running_flag = false;

        await this._source.close();

        this._logger.info(`Connector ${chalk.cyan(this._config.description)} running`);
    }
    
}