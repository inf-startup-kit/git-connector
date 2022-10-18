import { Command } from "commander";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import jtomler from "jtomler";
import json_from_schema from "json-from-default-schema";
import * as config_schema from "./schemes/config.json";
import * as connector_schema from "./schemes/connector.json";
import * as connector_git_source_schema from "./schemes/connector-git-source.json";
import * as connector_git_crypt_source_schema from "./schemes/connector-git-crypt-source.json";
import { IAppConfig } from "./config.interfaces";
import { AjvErrorHelper } from "./tools/ajv_error_helper";
import { IConnectorConfig, IConnectorGitSourceConfig, IConnectorGitCryptSourceConfig } from "./connector/interfaces";

type TPackage = {
    version: string
    name: string
    [key: string]: unknown
}

type TOptions = {
    config: string
}

const findPkg = (): TPackage => {

    const cwd_pkg_full_path = path.resolve(process.cwd(), "package.json");
    const dirname_pkg_full_path = path.resolve(__dirname, "package.json");
    const app_pkg_full_path = path.resolve(path.dirname(process.argv[1]), "package.json");
    const require_pkg_full_path = path.resolve(path.dirname(require.main.filename), "package.json"); 

    if (fs.existsSync(dirname_pkg_full_path) === true) {
        return <TPackage>JSON.parse(fs.readFileSync(dirname_pkg_full_path).toString());
    }
    if (fs.existsSync(app_pkg_full_path) === true) {
        return <TPackage>JSON.parse(fs.readFileSync(app_pkg_full_path).toString());
    }
    if (fs.existsSync(require_pkg_full_path) === true) {
        return <TPackage>JSON.parse(fs.readFileSync(require_pkg_full_path).toString());
    }   
    if (fs.existsSync(cwd_pkg_full_path) === true) {
        return <TPackage>JSON.parse(fs.readFileSync(cwd_pkg_full_path).toString());
    }

    return <TPackage>{
        version: "unknown",
        name: "template"
    };

};

const program = new Command();
const pkg = findPkg();

if (pkg === undefined) {
    console.error(`${chalk.bgRed(" FATAL ")} package.json not found`);
    process.exit(1);
}

program.version(`${pkg.name} version: ${pkg.version}`, "-v, --version", "output the current version.");
program.name(pkg.name);
program.option("-c, --config <type>", "Path to config file.");

program.parse(process.argv);

const options = program.opts<TOptions>();

if (process.env["GIT_CONNECTOR_CONFIG_PATH"] === undefined) {
	if (options.config === undefined) {
		console.error(`${chalk.bgRed(" FATAL ")} Not set --config key`);
		process.exit(1);
	}
} else {
	options.config = process.env["GIT_CONNECTOR_CONFIG_PATH"];
}

const full_config_path = path.resolve(process.cwd(), options.config);

if (!fs.existsSync(full_config_path)) {
    console.error(`${chalk.bgRed(" FATAL ")} Config file ${full_config_path} not found`);
    process.exit(1);
}

const config: IAppConfig = <IAppConfig>json_from_schema(jtomler.parseFileSync(full_config_path), config_schema);

const ajv = new Ajv({
    allErrors: true, 
    strict: false
});
const validate = ajv.compile(config_schema);

if (validate(config) === false) {
    const error_text = AjvErrorHelper(validate);
    console.error(`${chalk.bgRed(" FATAL ")} Config schema errors:\n${error_text}`);
    process.exit(1);
}

let i = 0;

for (let connector of config.connector) {

    const validate_connector = ajv.compile(connector_schema);
    connector = <IConnectorConfig>json_from_schema(connector, connector_schema);

    if (validate_connector(connector) === false) {
        const error_text = AjvErrorHelper(validate_connector);
        console.error(`${chalk.bgRed(" FATAL ")} Config schema connector[${i}] errors:\n${error_text}`);
        process.exit(1);
    }

    let validate_source;

    if (connector.source.type === "git") {
        validate_source = ajv.compile(connector_git_source_schema);
        connector.source = <IConnectorGitSourceConfig>json_from_schema(connector.source, connector_git_source_schema);
    }

    if (connector.source.type === "git-crypt") {
        validate_source = ajv.compile(connector_git_crypt_source_schema);
        connector.source = <IConnectorGitCryptSourceConfig>json_from_schema(connector.source, connector_git_crypt_source_schema);
    }

    if (validate_source === undefined) {
        console.error(`${chalk.bgRed(" FATAL ")} Config config.namespaces[${i}].source type ${chalk.red(connector.source.type)} not support`);
        process.exit(1);
    }

    if (config.policy.type === "only-start") {
        connector.source.cron.enable = false;
    }

    config.connector[i] = connector;
    
    ++i;
}

config.api.prefix = `/${config.api.prefix.replace(/(^\/|\/$)/g,"")}`;

if (config.policy.type === "only-start") {
    config.api.enable = false;
}

export default config;