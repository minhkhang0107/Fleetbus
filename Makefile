# ==============================================================================
# FLEETBUS UNIFIED MONOREPO MAKEFILE
# Orchestrates Node.js API Gateway, Passenger Flutter App, Driver Flutter App & Manager Web Portal
# ==============================================================================

.PHONY: all help build test lint start_server stop_server e2e \
        client_bootstrap client_sync client_build_dev client_build_prod \
        driver_bootstrap driver_sync driver_build_dev driver_build_prod \
        manager_bootstrap manager_sync manager_build_dev manager_build_prod manager_run_web \
        tailscale_check tailscale_url tailscale_server tailscale_apk

# Tailscale: other machines on your tailnet reach this server at http://<tailscale-ip>:3000.
# Override with `make tailscale_apk SERVER_URL=http://<magicdns-name>:3000` when needed.
PORT ?= 3000
TAILSCALE_IP := $(shell tailscale ip -4 2>/dev/null | head -n 1)
SERVER_URL ?= http://$(TAILSCALE_IP):$(PORT)

help:
	@echo "╔════════════════════════════════════════════════════════════════════╗"
	@echo "║                 FLEETBUS PLATFORM BUILD COMMANDS                   ║"
	@echo "╠════════════════════════════════════════════════════════════════════╣"
	@echo "║ Core Commands:                                                     ║"
	@echo "║   make build                - Build & package all platforms & dists║"
	@echo "║   make test                 - Run all automated test suites        ║"
	@echo "║   make lint                 - Run syntax and lint checks           ║"
	@echo "║   make start_server         - Launch unified Node.js API Gateway   ║"
	@echo "║                                                                    ║"
	@echo "║ Tailscale (other machines on your tailnet):                        ║"
	@echo "║   make tailscale_url        - Print the address others should use  ║"
	@echo "║   make tailscale_server     - Start the server for the tailnet     ║"
	@echo "║   make tailscale_apk        - Build both APKs pointing at it       ║"
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
	@echo "║                                                                    ║"
	@echo "║ Manager Operations Portal (Flutter Web / Melos):                   ║"
	@echo "║   make manager_bootstrap    - Run Melos bootstrap for Manager Web  ║"
	@echo "║   make manager_sync         - Sync Manager Web code generator      ║"
	@echo "║   make manager_run_web      - Run Manager Web locally on Chrome    ║"
	@echo "║   make manager_build_dev    - Build develop web distribution       ║"
	@echo "║   make manager_build_prod   - Build production web distribution    ║"
	@echo "╚════════════════════════════════════════════════════════════════════╝"

# ------------------------------------------------------------------------------
# Core Platform & API Gateway
# ------------------------------------------------------------------------------
build:
	node tools/build_system.js

test:
	npm test

lint:
	npm run lint

start_server:
	node source/server/apiServer.js

tailscale_check:
	@test -n "$(TAILSCALE_IP)" || (echo "Tailscale chưa chạy trên máy này (tailscale ip -4 không trả về địa chỉ)."; exit 1)

tailscale_url: tailscale_check
	@echo "API và web điều hành: $(SERVER_URL)  (web: $(SERVER_URL)/manager)"

# Links sent to passengers (bus tracking for relatives) use this address instead of localhost.
tailscale_server: tailscale_check
	FLEETBUS_PUBLIC_URL=$(SERVER_URL) PORT=$(PORT) node source/server/apiServer.js

# Debug APKs (flavor develop) whose API address is the tailnet one; copied to dist/tailscale/.
tailscale_apk: tailscale_check
	cd source/passenger/app && flutter build apk --debug --flavor develop --dart-define=FLEETBUS_API_URL=$(SERVER_URL)
	cd source/driver/app && flutter build apk --debug --flavor develop --dart-define=FLEETBUS_API_URL=$(SERVER_URL)
	mkdir -p dist/tailscale
	cp source/passenger/app/build/app/outputs/flutter-apk/app-develop-debug.apk dist/tailscale/busgo-passenger.apk
	cp source/driver/app/build/app/outputs/flutter-apk/app-develop-debug.apk dist/tailscale/busgo-driver.apk
	@echo "APK trỏ tới $(SERVER_URL): dist/tailscale/busgo-passenger.apk, dist/tailscale/busgo-driver.apk"

e2e:
	node test/e2e_live_flow.js

# ------------------------------------------------------------------------------
# Passenger App (source/passenger/)
# ------------------------------------------------------------------------------
passenger_bootstrap client_bootstrap:
	cd source/passenger && melos bootstrap

passenger_sync client_sync:
	cd source/passenger && $(MAKE) sync

passenger_build_dev client_build_dev:
	cd source/passenger && $(MAKE) build_dev_apk

passenger_build_prod client_build_prod:
	cd source/passenger && $(MAKE) build_prod_apk

passenger_test client_test:
	cd source/passenger && $(MAKE) test

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

# ------------------------------------------------------------------------------
# Manager Operations Web App (source/manager/)
# ------------------------------------------------------------------------------
manager_bootstrap:
	cd source/manager && melos bootstrap

manager_sync:
	cd source/manager && $(MAKE) sync

manager_run_web:
	cd source/manager && $(MAKE) run_web

manager_build_dev:
	cd source/manager && $(MAKE) build_dev_web

manager_build_prod:
	cd source/manager && $(MAKE) build_prod_web

manager_test:
	cd source/manager && $(MAKE) test
