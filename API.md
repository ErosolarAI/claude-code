# AGI Core API Documentation

## Core Modules

### AGICore
The main orchestrator for AI agents.

### Capability Modules
- OffensiveDestructionCapabilityModule
- EliteCryptoMilitaryCapabilityModule  
- MaxOffensiveUkraineCapabilityModule
- UnifiedMilitaryCapabilityModule

### UI Components
- UnifiedUIRenderer
- PromptController

## Usage Examples

```javascript
import { AGICore } from 'agi-core-cli';
import { OffensiveDestructionCapabilityModule } from 'agi-core-cli/security';

const core = new AGICore();
const capability = new OffensiveDestructionCapabilityModule();
```

## Configuration

See config.ts for available configuration options.

---
*Generated: 2025-12-17T22:09:53.473Z*
