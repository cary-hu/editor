# TOAST UI Editor Copilot Instructions

This is a fork of TOAST UI Editor - a GFM Markdown and WYSIWYG editor with enhanced features including table merging and image editing capabilities.

## Architecture Overview

This is a **monorepo** using Lerna and npm workspaces with three main packages:
- `app/` - Core editor (`@caryhu/tui.editor`)  
- `libs/toastmark/` - Markdown parser (`@toast-ui/toastmark`)
- `plugins/*` - Optional plugins (not yet implemented in this fork)

### Core Components

The editor has a **dual-mode architecture**:
- **EditorCore** (`app/src/editorCore.ts`) - Core functionality shared between modes
- **MarkdownEditor** - Live preview with syntax highlighting and scroll sync
- **WysiwygEditor** - Rich text editing using ProseMirror
- **Viewer** - Read-only markdown renderer

Key architectural patterns:
- **Command Pattern**: All actions go through `CommandManager` (see `app/src/commands/`)
- **Event-driven**: Central `EventEmitter` coordinates between components
- **Convertor Chain**: Bidirectional conversion between Markdown ↔ WYSIWYG via `app/src/convertors/`
- **Plugin System**: Extensible via plugins that register commands, toolbar items, and convertors

## Development Workflow

### Environment Setup
```bash
npm install                           # Install all workspace dependencies
type=editor npm run serve            # Start dev server (Vite)
type=editor npm run serve:ie         # Legacy webpack dev server for IE testing
```

### Testing
```bash
type=editor npm test                 # Watch mode testing  
type=editor npm run test:ci          # CI mode
type=editor npm run test:types       # TypeScript checking
npm run test:all                     # Test all packages
```

### Building
```bash
type=editor npm run build            # Build editor package
type=toastmark npm run build         # Build toastmark package
npm run build:all                    # Build all packages
```

**Important**: Use `type=<package>` environment variable with `scripts/pkg-script.js` to target specific packages.

## Key Conventions

### File Organization
- `@/` alias points to `app/src/`
- `@t/` alias points to `app/types/`
- Each feature has dedicated folders: `markdown/`, `wysiwyg/`, `ui/`, `plugins/`
- Tests colocated with source: `__test__/` directories

### Plugin Development
Plugins extend the editor via:
```typescript
// Register in app/src/helper/plugin.ts
const plugin = (context) => {
  const { pmState, commands, eventEmitter } = context;
  // Add commands, toolbar items, convertors
};
```

### TypeScript Patterns
- Strict type definitions in `app/types/`
- ProseMirror integration via custom type definitions
- Event typing through `@t/event` module

### CSS Architecture
- Component-scoped CSS in `app/src/css/`
- Theme support via CSS custom properties
- Dark theme in `app/src/css/theme/dark.css`

## Critical Integration Points

### ProseMirror (WYSIWYG Mode)
- Schema defined in `app/src/wysiwyg/nodes/` and `app/src/wysiwyg/marks/`
- Commands in `app/src/wysiwyg/command/`
- State management via plugins in `app/src/wysiwyg/plugins/`

### ToastMark (Markdown Parsing)
- Custom markdown parser in `libs/toastmark/`
- Extensions for GFM features and tables
- Integration via `app/src/markdown/`

### Build Pipeline
- **Development**: Vite with live reload
- **Production**: Webpack for multiple output formats (UMD, ESM, CommonJS)
- **i18n**: Separate webpack config for internationalization bundles

### Key Cross-Component Flows
1. **Mode Switching**: `EditorCore.changeMode()` → convertor chain → state sync
2. **Command Execution**: User action → `CommandManager.exec()` → mode-specific command
3. **Content Updates**: Edit → convertor → `eventEmitter.emit('change')` → UI updates

## Fork-Specific Features

This fork adds:
- **Table merging capabilities** - Enhanced table plugin with cell merging
- **Image editing panel** - Built-in image manipulation tools
- **Extended toolbar** - Additional formatting options

When modifying these features, ensure backward compatibility with the original TOAST UI Editor API.
