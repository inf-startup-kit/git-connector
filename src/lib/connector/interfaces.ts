import { EventEmitter } from "events";

export interface IConnector {
    run: () => Promise<void>
    close: () => Promise<void>
}

export interface IConnectorSource extends EventEmitter {
    run: () => Promise<void>
    close: () => Promise<void>
}

export interface IConnectorConfig {
    enable: boolean
    description: string
    recreate_destination_folder: boolean
    destination_folder: string
    source: IConnectorSourceConfig
}

export type TConnectorSourceConfigType = "git" | "git-crypt"

export interface IConnectorSourceConfig {
    type: TConnectorSourceConfigType
}

export interface IConnectorGitSourceConfig extends IConnectorSourceConfig {
    include_regexp: string
    exclude_regexp: string
    size: string
    tmp: string
    cron: {
        enable: boolean
        jitter: number
        interval: string,
        time_zone: string
    }
    commit_count: number
    repository: string
    branch: string
    target_folder: string
}

export interface IConnectorGitCryptSourceConfig extends IConnectorGitSourceConfig {
    crypt_key_path: string
}

export interface IConnectorSourceEvent {
    type: "add" | "delete"
    id: string
    path: string
    hash: string
}