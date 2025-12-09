# SPDX-FileCopyrightText: 2025 Alexandre Gomes Gaigalas <alganet@gmail.com>
#
# SPDX-License-Identifier: ISC

.PHONY: all chrome firefox clean

FILES := src icons LICENSE

all: chrome firefox

chrome: 
	@echo "Building for Chrome..."
	rm -f lidar-chrome.zip
	cp manifest_chrome.json manifest.json
	zip -r lidar-chrome.zip manifest.json $(FILES)
	rm manifest.json
	@echo "Done: lidar-chrome.zip"

firefox: 
	@echo "Building for Firefox..."
	rm -f lidar-firefox.zip
	cp manifest_firefox.json manifest.json
	zip -r lidar-firefox.zip manifest.json $(FILES)
	mv lidar-firefox.zip lidar-firefox.xpi
	rm manifest.json
	@echo "Done: lidar-firefox.xpi"

clean:
	rm -f lidar-chrome.zip lidar-firefox.xpi manifest.json
