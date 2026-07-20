PACKAGES_DIR ?= .packages
SOURCE_DIR ?= .icons
METADATA_DIR ?= .metadata
METADATA_FILE ?= $(METADATA_DIR)/material-symbols.json
METADATA_URL ?= https://fonts.google.com/metadata/icons?incomplete=true&key=material_symbols

# Optional transform filters for local test builds and targeted package builds.
# The source checkout is still a normal shallow clone; these filters only affect
# which SVG files are transformed into packages.
ICONS ?=
STYLES ?=
WEIGHTS ?=
GRADES ?=
FILLS ?=
TRANSFORM_FILTER_ARGS = $(if $(ICONS),--icons $(ICONS)) $(if $(STYLES),--styles $(STYLES)) $(if $(WEIGHTS),--weights $(WEIGHTS)) $(if $(GRADES),--grades $(GRADES)) $(if $(FILLS),--fills $(FILLS))
TRANSFORM_ARGS ?= $(TRANSFORM_FILTER_ARGS)

.PHONY: icons metadata packages .packages build all clean-icons clean-metadata clean-packages clean

$(SOURCE_DIR):
	git clone \
    --depth 1 \
    https://github.com/google/material-design-icons.git \
    $(SOURCE_DIR)

icons: $(SOURCE_DIR)

$(METADATA_FILE):
	mkdir -p $(dir $@)
	curl --fail --location --user-agent "Mozilla/5.0" --output "$(METADATA_FILE)" "$(METADATA_URL)"

metadata: $(METADATA_FILE)

packages .packages: icons metadata
	npm run transform -- $(PACKAGES_DIR) --source $(SOURCE_DIR) --metadata $(METADATA_FILE) $(TRANSFORM_ARGS)

build: packages
	for package in $(PACKAGES_DIR)/*; do \
		if [ -f "$$package/package.json" ]; then \
			npm install --ignore-scripts --prefix "$$package"; \
			npm run build --prefix "$$package"; \
		fi; \
	done

all: build

clean-icons:
	rm -rf .icons

clean-metadata:
	rm -rf $(METADATA_DIR)

clean-packages:
	rm -rf $(PACKAGES_DIR)

clean: clean-packages clean-icons clean-metadata
