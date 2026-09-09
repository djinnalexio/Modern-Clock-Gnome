# SPDX-License-Identifier: CC0-1.0
# SPDX-FileCopyrightText: No rights reserved

.PHONY: disable enable format install lint pack pot prefs test uninstall

# set data to default if not it is not already set
XDG_DATA_HOME ?= $(HOME)/.local/share

# file to check if node_modules are installed
NODE_MODULES_STAMP := node_modules/.install-stamp

UUID := $(shell jq -r '.uuid' src/metadata.json)
FONTS_DIR = $(XDG_DATA_HOME)/fonts/modernclock

pack:
	gnome-extensions pack ./src --extra-source=fonts --force
	mkdir -p dist
	mv -f $(UUID).shell-extension.zip dist/
	@echo "✓ Archive: dist/$(UUID).shell-extension.zip"
	@echo ""

install: pack
	gnome-extensions install dist/$(UUID).shell-extension.zip --force
	mkdir -p $(FONTS_DIR)
	cp -f src/fonts/* $(FONTS_DIR)/
	fc-cache -f || echo "warning: fc-cache failed, font cache not refreshed"
	@echo "✓ Готово! Перелогинься."
	@echo ""

uninstall:
	gnome-extensions uninstall $(UUID)
	rm $(FONTS_DIR) -rf
	@echo "✓ Удалено"
	@echo ""

prefs: install
	gnome-extensions prefs $(UUID)
	@echo "✓ Preferences window opened."
	@echo ""

enable:
	gnome-extensions enable $(UUID)
	@echo "✓ Extension enabled."
	@echo ""

disable:
	gnome-extensions disable $(UUID)
	@echo "✓ Extension disabled."
	@echo ""

test: install
	@echo "Launching nested shell (GNOME 49+)..."
	G_MESSAGES_DEBUG='GNOME Shell' exec dbus-run-session gnome-shell --devkit
	@echo ""

$(NODE_MODULES_STAMP): package-lock.json
	npm ci
	@touch $(NODE_MODULES_STAMP)
	@echo "✓ Installed NodeJS modules."

format: $(NODE_MODULES_STAMP)
	@echo "Running Prettier to fix format..."
	npx prettier --write src
	@echo ""

lint: $(NODE_MODULES_STAMP)
	@echo "Running ESLint to catch errors..."
	npx eslint --fix src
	@echo ""

pot:
	xgettext --from-code=UTF-8 --output=src/po/$(UUID).pot src/*.js
	@echo "✓ Updated '$(UUID).pot' file for translations."
	@echo ""
