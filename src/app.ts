import config from "./lib/init";
import chalk from "chalk";
import { LoggerEventEmitter } from "logger-event-emitter";
import { buildApiServer } from "./http/build_api_server";
import { Connector } from "./lib/connector";
import { IConnector } from "./lib/connector/interfaces";

const logger = new LoggerEventEmitter(config.logger);

logger.debug(`\nCONFIG:\n${JSON.stringify(config, null, 4)}`);

let connector_id = 1;
const connectors: IConnector[] = [];

for (const connector_config of config.connector) {
    connectors.push(new Connector(`${connector_id}`, connector_config, logger.child(`connector_${connector_id}`)));
    connector_id += 1;
}

const bootstrap = async () => {

    if (config.policy.type === "only-start") {

        try {

            for (const connector of connectors) {
                await connector.run();
                await connector.close();
            }

        } catch (error) {
            logger.fatal(`Error application start.\n${error.stack}`);
            process.exit(1);
        }

    }

    if (config.policy.type === "watch") {

        try {

            const api_server_logger = logger.child("api-server");
            const api_server = buildApiServer(config.api, api_server_logger);
            
    
            if (config.api.enable === true) {
    
                api_server.listen({
                    port: config.api.port,
                    host: config.api.hostname,
                    backlog: config.api.backlog
                }, (error: Error, address: string) => {
                    if (error !== null) {
                        api_server_logger.fatal(`Error start server. Error: ${chalk.red(error)}`);
                        process.exit(1);
                    }
                    api_server_logger.info(`Server listening on ${chalk.cyan(address)}`);
                });
            }
    
            for (const connector of connectors) {
                connector.run();
            }
    
            const stop_app = async () => {
                api_server.close();
                for (const connector of connectors) {
                    await connector.close();
                }
                setImmediate( () => {
                    process.exit();
                });
            };
    
            process.on("SIGTERM", () => {
                logger.info(`Signal ${chalk.cyan("SIGTERM")} received`);
                stop_app();
            });
    
            process.on("SIGINT", () => {
                logger.info(`Signal ${chalk.cyan("SIGINT")} received`);
                stop_app();
            });
    
        } catch (error) {
            logger.fatal(`Error application start.\n${error.stack}`);
            process.exit(1);
        }

    }

};

bootstrap();