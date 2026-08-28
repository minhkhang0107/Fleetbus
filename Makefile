# ==============================================================================
# FLEETBUS UNIFIED MONOREPO MAKEFILE
# Orchestrates Node.js API Gateway, Passenger Flutter App & Driver Flutter App
# ==============================================================================

.PHONY: all help test lint start_server stop_server e2e \
        client_bootstrap client_sync client_build_dev client_build_prod \
        driver_bootstrap driver_sync driver_build_dev driver_build_prod

help:
	@echo "╔════════════════════════════════════════════════════════════════════╗"
	@echo "║                 FLEETBUS PLATFORM BUILD COMMANDS                   ║"
	@echo "╠════════════════════════════════════════════════════════════════════╣"
	@echo "║ Core Commands:                                                     ║"
	@echo "║   make test                 - Run all 68 automated test suites     ║"
	@echo "║   make lint                 - Run syntax and lint checks           ║"
	@echo "║   make start_server         - Launch unified Node.js API Gateway   ║"
	@echo "║   make e2e                  - Run live end-to-end integration test ║"
	@echo "║                                                                    ║"
	@echo "║ Passenger App (Flutter / Melos):                                   ║"
	@echo "║   make client_bootstrap     - Run Melos bootstrap for Passenger    ║"
	@echo "║   make client_sync          - Sync l10n and build_runner           ║"
	@echo "║   make client_build_dev     - Build develop APK with dart-defines  ║"
	@echo "║   make client_build_prod    - Build production APK                 ║"
	@echo "║                                                                    ║"
	@echo "║ Driver Cockpit App (Flutter / Melos):                              ║"
	@echo "║   make driver_bootstrap     - Run Melos bootstrap for Driver       ║"
	@echo "║   make driver_sync          - Sync l10n and build_runner           ║"
	@echo "║   make driver_build_dev     - Build develop APK for Driver         ║"
	@echo "║   make driver_build_prod    - Build production APK for Driver      ║"
	@echo "╚════════════════════════════════════════════════════════════════════╝"

# ------------------------------------------------------------------------------
# Core Platform & API Gateway
# ------------------------------------------------------------------------------
test:
	npm test

lint:
	npm run lint

start_server:
	node source/server/apiServer.js

e2e:
	node test/e2e_live_flow.js

# ------------------------------------------------------------------------------
# Passenger App (source/client/)
# ------------------------------------------------------------------------------
client_bootstrap:
	cd source/client && melos bootstrap

client_sync:
	cd source/client && $(MAKE) sync

client_build_dev:
	cd source/client && $(MAKE) build_dev_apk

client_build_prod:
	cd source/client && $(MAKE) build_prod_apk

client_test:
	cd source/client && $(MAKE) test

# ------------------------------------------------------------------------------
# Driver App (source/driver/)
# ------------------------------------------------------------------------------
driver_bootstrap:
	cd source/driver && melos bootstrap

driver_sync:
	cd source/driver && $(MAKE) sync

driver_build_dev:
	cd source/driver && $(MAKE) build_dev_apk

driver_build_prod:
	cd source/driver && $(MAKE) build_prod_apk

driver_test:
	cd source/driver && $(MAKE) test
