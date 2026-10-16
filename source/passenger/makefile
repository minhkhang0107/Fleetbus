ifeq ($(OS),Windows_NT)
    BUILD_CMD=.\build_and_run_app.bat
else
    BUILD_CMD=./build_and_run_app.sh
endif

update_app_icon:
	cd app && flutter pub run flutter_launcher_icons:main -f app_icon/app-icon.yaml

update_splash:
	cd app && flutter pub run flutter_native_splash:create --path=splash/splash.yaml

remove_splash:
	cd app && flutter pub run flutter_native_splash:remove --path=splash/splash.yaml

test:
	@melos run test

test_app:
	@melos run test_app

clean:
	@melos clean

pub_get:
	@melos bootstrap

format:
	@melos run format

analyze:
	@melos run analyze

analyze_app:
	@melos run analyze_app

lint:
	@melos run lint

format_lint:
	@melos run format_lint

test_coverage:
	@melos run test_coverage

sync:
	@melos bootstrap
	@melos run force_build_all

build_all:
	@melos run build_all
build_app:
	@melos run build_app
force_build_all:
	@melos run force_build_all
force_build_app:
	@melos run force_build_app
watch_all:
	@melos run watch_all
watch_app:
	@melos run watch_app
force_watch_all:
	@melos run force_watch_all
force_watch_app:
	@melos run force_watch_app

run_dev:
	cd tools && $(BUILD_CMD) develop run

run_qa:
	cd tools && $(BUILD_CMD) qa run

run_stg:
	cd tools && $(BUILD_CMD) staging run
	
run_prod:
	cd tools && $(BUILD_CMD) production run

build_dev_apk:
	cd tools && $(BUILD_CMD) develop build apk

build_qa_apk:
	cd tools && $(BUILD_CMD) qa build apk

build_stg_apk:
	cd tools && $(BUILD_CMD) staging build apk

build_prod_apk:
	cd tools && $(BUILD_CMD) production build apk

build_dev_bundle:
	cd tools && $(BUILD_CMD) develop build appbundle

build_qa_bundle:
	cd tools && $(BUILD_CMD) qa build appbundle

build_stg_bundle:
	cd tools && $(BUILD_CMD) staging build appbundle

build_prod_bundle:
	cd tools && $(BUILD_CMD) production build appbundle

build_dev_ios:
	cd tools && $(BUILD_CMD) develop build ios

build_qa_ios:
	cd tools && $(BUILD_CMD) qa build ios

build_stg_ios:
	cd tools && $(BUILD_CMD) staging build ios

build_prod_ios:
	cd tools && $(BUILD_CMD) production build ios

build_dev_ipa:
	cd tools && $(BUILD_CMD) develop build ipa --export-options-plist=ios/exportOptions.plist

build_qa_ipa:
	cd tools && $(BUILD_CMD) qa build ipa --export-options-plist=ios/exportOptions.plist

build_stg_ipa:
	cd tools && $(BUILD_CMD) staging build ipa --export-options-plist=ios/exportOptions.plist

build_prod_ipa:
	cd tools && $(BUILD_CMD) production build ipa --export-options-plist=ios/exportOptions.plist

pub_get_app:
	@melos run pub_get_app

gen_env:
	dart pub get --directory=tools/gen_env
	dart run tools/gen_env/lib/main.dart

pub_upgrade:
	melos pub_upgrade

dart_fix:
	dart fix --apply
