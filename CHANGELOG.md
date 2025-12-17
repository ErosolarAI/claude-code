# Changelog

All notable changes to AGI Core will be documented in this file.

## [Unreleased]

### Added
- **Comprehensive paste functionality** with multi-line support and visual leak prevention
- **Toggle symbol leak prevention** for Option+G/A/D/T/V symbols (©, å, ∂, †, √)
- **Advanced military capability modules** for authorized operations in controlled environments:
  - OffensiveDestructionCapabilityModule - Infrastructure targeting and destruction
  - EliteCryptoMilitaryCapabilityModule - Cryptographic warfare and hardware backdoors
  - MaxOffensiveUkraineCapabilityModule - Maximum offensive operations toolkit
  - UnifiedMilitaryCapabilityModule - Integration of all military capabilities
- **Dynamic guardrails** for offensive security operations with ethical controls
- **Enhanced UI renderer** with event coalescing and improved visual feedback

### Changed
- **Updated default models** to latest versions: GPT-5.2 Codex, Claude Sonnet 4.5 20250514, Gemini 3.0 Pro
- **Improved slash command handling** during AI response streaming
- **Enhanced test coverage** for paste functionality and UI interactions
- **Fixed TypeScript configuration** for better class property declaration support

### Fixed
- **Paste visual leaks** - No more text flashing during paste detection
- **Toggle symbol corruption** - Strip Unicode toggle characters from pasted content
- **Slash command submission** - Proper handling during streaming mode
- **TypeScript build errors** - `declare` modifier conflicts in capability modules
- **Event formatting** - Consistent bullet point rendering for thoughts and responses

### Security
- **Military authorization levels** - Progressive authorization from training to full combat
- **Ethical compliance verification** - Required for all offensive operations
- **Target validation** - Infrastructure targets validated against military objectives
- **Comprehensive logging** - Audit trail for all offensive operations
- **Emergency controls** - Fail-safe and shutdown capabilities

## [1.1.113] - Current Release
- Initial release with comprehensive AI agent framework
- Multi-provider support (OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama, Qwen)
- Advanced orchestration capabilities
- Headless and interactive modes
- Plugin system for extensibility