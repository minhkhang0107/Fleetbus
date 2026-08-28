# Tutorials for this project
## Getting Started

### Requirements
- Dart: 3.6.0
- Flutter SDK: 3.27.1
- melos: 6.3.0
- gradle: 8.9 and AGP: 8.5.0
### Install

- WARN: If you already installed `melos` , you could omit this step.

- Install melos:
    - Run `dart pub global activate melos 6.3.0`

- Install lefthook (optional):
    - Run `gem install lefthook`

- Export paths:
    - Add to `.zshrc` or `.bashrc` file
```    
export PATH="$PATH:<path to flutter>/flutter/bin"
export PATH="$PATH:<path to flutter>/flutter/bin/cache/dart-sdk/bin"
export PATH="$PATH:~/.pub-cache/bin"
```
    - Save file `.zshrc`
    - Run `source ~/.zshrc`

### Config and run app

- cd to root folder of project
- Run `make gen_env`
- Run `make sync`
MIT
