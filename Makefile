HA_COMPONENTS_DIR ?= /var/lib/homeassistant/homeassistant/custom_components

.PHONY: lint clean deploy deploy-js

lint:
	ruff check custom_components/

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -name "*.pyc" -delete 2>/dev/null; true

## Copy integration to HA instance and restart (Python + JS changes)
deploy:
	sudo cp -r custom_components/ourgroceries_kiosk $(HA_COMPONENTS_DIR)/
	sudo docker restart homeassistant

## Copy only the JS card to HA instance (JS-only changes — hard refresh browser)
deploy-js:
	sudo cp custom_components/ourgroceries_kiosk/frontend/ourgroceries-kiosk-card.js \
		$(HA_COMPONENTS_DIR)/ourgroceries_kiosk/frontend/
	@echo "JS deployed. Hard refresh the browser (Ctrl+Shift+R)."
