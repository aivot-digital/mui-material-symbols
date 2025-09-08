.icons:
	git clone \
    --depth 1 \
    https://github.com/google/material-design-icons.git \
    .icons

.packages: .icons
	npm run transform .packages

.packages/*/dist: .packages
	npm install --prefix $(dir $@)
	npm run build --prefix $(dir $@)

build: .packages .packages/*/dist

all: build

clean-icons:
	rm -rf .icons

clean-packages:
	rm -rf .packages

clean: clean-packages clean-icons
