import { EventEmitter } from "events";
import { IConnectorGitCryptSourceConfig, IConnectorGitSourceConfig, IConnectorSource, IConnectorSourceConfig, IConnectorSourceEvent } from "../interfaces";
import { ILoggerEventEmitter } from "logger-event-emitter";
import chalk from "chalk";
import { ConnectorGitSource } from "./git-source";
import { ConnectorGitCryptSource } from "./git-crypt-source";

export class ConnectorSource extends EventEmitter implements IConnectorSource {

    private readonly _source: IConnectorSource;

    constructor (
        id: string,
        config: IConnectorSourceConfig,
        logger: ILoggerEventEmitter
    ) {

        super();

        if (config.type === "git") {
            this._source = new ConnectorGitSource(id, <IConnectorGitSourceConfig>config, logger);
        }

        if (config.type === "git-crypt") {
            this._source = new ConnectorGitCryptSource(id, <IConnectorGitCryptSourceConfig>config, logger);
        }

        if (this._source === undefined) {
            logger.fatal(`Connector source type ${chalk.red(config.type)} not support`);
            process.exit(1);
        }

        this._source.on("delete", (events: IConnectorSourceEvent[]) => {
            for (const event of events) {
                this.emit("delete", event.id);
            }
        });

        this._source.on("add", (events: IConnectorSourceEvent[]) => {
            for (const event of events) {
                this.emit("add", event.id, event.path);
            }
        });

    }

    async run (): Promise<void> {
        await this._source.run();
    }

    async close (): Promise<void> {
        await this._source.close();
    }

}