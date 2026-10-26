UUID     := appstash@ygurin.github.io
EXT_DIR  := $(HOME)/.local/share/gnome-shell/extensions
TARGET   := $(EXT_DIR)/$(UUID)
SCHEMAS  := schemas/gschemas.compiled

.PHONY: all schemas install uninstall enable disable prefs pack clean

all: schemas

schemas: $(SCHEMAS)

$(SCHEMAS): schemas/*.gschema.xml
	glib-compile-schemas schemas/

# Symlink the repo into the extensions dir so edits take effect on next login.
install: schemas
	@mkdir -p "$(EXT_DIR)"
	@if [ -e "$(TARGET)" ] && [ ! -L "$(TARGET)" ]; then \
		echo "error: $(TARGET) exists and is not a symlink; remove it first" >&2; \
		exit 1; \
	fi
	ln -sfn "$(CURDIR)" "$(TARGET)"
	@echo "Installed. Log out and back in, then run: make enable"

uninstall:
	-gnome-extensions disable $(UUID) 2>/dev/null
	rm -f "$(TARGET)"

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

prefs:
	gnome-extensions prefs $(UUID)

# Build a zip installable with: gnome-extensions install --force $(UUID).shell-extension.zip
pack:
	gnome-extensions pack --force --extra-source=src --extra-source=icon.svg .

clean:
	rm -f $(SCHEMAS) $(UUID).shell-extension.zip
