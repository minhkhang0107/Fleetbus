ifeq ($(OS),Windows_NT)
    BUILD_CMD=.\tools\build_and_run_app.bat
else
    BUILD_CMD=./tools/build_and_run_app.sh
endif

pub_get:
	@melos bootstrap

clean:
	@melos clean

sync:
	@melos bootstrap
	@melos run force_build_all

build_all:
	@melos run build_all

force_build_all:
	@melos run force_build_all

test:
	@melos run test

analyze:
	@melos run analyze

format:
	@melos run format

run_web:
	cd tools && $(BUILD_CMD) develop run web

run_web_prod:
	cd tools && $(BUILD_CMD) production run web

build_dev_web:
	cd tools && $(BUILD_CMD) develop build web

build_qa_web:
	cd tools && $(BUILD_CMD) qa build web

build_stg_web:
	cd tools && $(BUILD_CMD) staging build web

build_prod_web:
	cd tools && $(BUILD_CMD) production build web

gen_env:
	dart pub get --directory=tools/gen_env
	dart run tools/gen_env/lib/main.dart
