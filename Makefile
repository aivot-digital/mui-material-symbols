PACKAGES_DIR ?= .packages
SOURCE_DIR ?= .icons

# Optional transform filters for local test builds and targeted package builds.
# The source checkout is still a normal shallow clone; these filters only affect
# which SVG files are transformed into packages.
ICONS ?=
STYLES ?=
WEIGHTS ?=
FILLS ?=
TRANSFORM_FILTER_ARGS = $(if $(ICONS),--icons $(ICONS)) $(if $(STYLES),--styles $(STYLES)) $(if $(WEIGHTS),--weights $(WEIGHTS)) $(if $(FILLS),--fills $(FILLS))
TRANSFORM_ARGS ?= $(TRANSFORM_FILTER_ARGS)

.PHONY: icons packages .packages build all clean-icons clean-packages clean

$(SOURCE_DIR):
	git clone \
    --depth 1 \
    https://github.com/google/material-design-icons.git \
    $(SOURCE_DIR)

icons: $(SOURCE_DIR)

packages .packages: icons
	npm run transform -- $(PACKAGES_DIR) --source $(SOURCE_DIR) $(TRANSFORM_ARGS)

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

clean-packages:
	rm -rf $(PACKAGES_DIR)

clean: clean-packages clean-icons
