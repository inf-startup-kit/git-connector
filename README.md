# Git-connector

## Информация

Сервис для синхронизации git репозитория с папками на локальной машине.

## Оглавление:
- [Установка](#install)
- [Запуска](#launch)
- [Конфигурация](#configuration)
- [API](#api)

## <a name="install"></a> Запуск и установка

пример строки запуска: `node /git-connector/app.js -c config.toml`

## <a name="launch"></a> Таблица ключей запуска

Ключ | Описание
------------ | -------------
--version, -v | вывести номер версии приложения
--help, -h | вызвать справку по ключам запуска
--config, -c | путь к файлу конфигурации в формате toml или json, (переменная среды: GIT_CONNECTOR_CONFIG_PATH)

## <a name="configuration"></a> Конфигурация

Программа настраивается через файл конфигурации форматов TOML, JSON, YML и YAML. Так же можно настраивать через переменные среды, которые будут считаться первичными.

### Секции файла конфигурации

- **logger** - настройка логгера (переменная среды: GIT_CONNECTOR_LOGGER)
- **api** - активация API сервера (переменная среды: GIT_CONNECTOR_API)
- **connector** - массив с настройками коннекторов

### Пример файла конфигурации config.toml

```toml
[logger]                    # настройка логгера
    name = ""               # имя логгера
    enable = true           # активация
    level = "error"         # уровень (fatal, error, warn, info, debug, trace)
    timestamp = "none"      # вывод времени full, short, unix и none

[policy]            # политика запуска
    type = "watch"  # "watch" или "only-start"

[api]
    enable = false              # активация API сервера
    logging = false             # логирование запросов (ключ logger.level = "debug" или ниже)
    hostname = "0.0.0.0"        # хост          
    port = 3001                 # порт
    backlog = 511               # очередь баклога
    prefix = "/api"             # префикс
    connection_timeout = 0      # таймаут сервера в миллисекундах
    keep_alive_timeout = 5000   # таймаут keep-alive сервера в миллисекундах
    body_limit = "1mb"          # максимальный размер тела запроса (b, kb, mb)
    trust_proxy = false         # доверие proxy заголовку

[[connector]]
    enable = true                       # активация
    description = ""                    # описание
    destination_folder = ""             # папка назначения
    recreate_destination_folder = true  # пересоздание папки назначения
    [connector.source]                  # настройка источника
        type = "git"                                                    # тип источника
        include_regexp = [".*"]                                         # файлы будут включены в поиск        
        exclude_regexp = ["\\.md$"]                                     # файлы будут исключены из поиска
        tmp = "tmp"                                                     # временная папка
        target_folder = "/"                                             # целевая папка
        size = "200kb"                                                  # максимальный размер файла
        commit_count = 10                                               # количество хранимых коммитов
        repository = "https://user:password@localhost/repository.git"   # репозиторий
        branch = "main"                                                 # ветка репозитория
        [connector.source.cron]             # настройка обновления
            enable = true                   # активация
            jitter = 3                      # интервал дрожания
            interval = "*/10 * * * * *"     # интервал
            time_zone = "Europe/Moscow"     # временная зона

[[connector]]
    enable = true                       # активация
    description = ""                    # описание
    destination_folder = ""             # папка назначения
    recreate_destination_folder = true  # пересоздание папки назначения
    [connector.source]                  # настройка источника
        type = "git-crypt"                                              # тип источника
        include_regexp = [".*"]                                         # файлы будут включены в поиск        
        exclude_regexp = ["\\.md$"]                                     # файлы будут исключены из поиска
        tmp = "tmp"                                                     # временная папка
        target_folder = "/"                                             # целевая папка
        size = "200kb"                                                  # максимальный размер файла
        commit_count = 10                                               # количество хранимых коммитов
        repository = "https://user:password@localhost/repository.git"   # репозиторий
        branch = "main"                                                 # ветка репозитория
        crypt_key_path = ""                                             # путь к ключу репозитория
        [connector.source.cron]             # настройка обновления
            enable = true                   # активация
            jitter = 3                      # интервал дрожания
            interval = "*/10 * * * * *"     # интервал
            time_zone = "Europe/Moscow"     # временная зона
```

Оригинальный файл [тут](docs/config_example.toml)

### Настройка через переменные среды

Ключи конфигурации можно задать через переменные среды ОС. Имя переменной среды формируется из двух частей, префикса `GIT_CONNECTOR_` и имени переменной в верхнем реестре. Если переменная вложена, то это обозначается символом `_`. Переменные среды имеют высший приоритет.

пример для переменной **api.enable**: `GIT_CONNECTOR_API_ENABLE`

## <a name="api"></a> API

Сервис предоставляет API, который настраивается в секции файла настройки **api**. API доступно по протоколу HTTP.

### Примеры применения

проверить доступность сервера: `curl -i http://localhost:3001/healthcheck` или `curl -i http://localhost:3001/`  

### API информации сервиса

| URL | Метод | Код | Описание | Пример ответа/запроса |
| ----- | ----- | ----- | ----- | ----- |
| /_ping | GET | 200 | проверить здоровье сервиса | OK |
| /healthcheck | GET | 200 | проверить здоровье сервиса | OK |
| /healthcheck/liveness | GET | 200 | проверить здоровье сервиса | OK |
| /healthcheck/readiness | GET | 200 | проверить готовность сервиса | OK |
