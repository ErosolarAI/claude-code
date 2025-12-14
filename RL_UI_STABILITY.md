# Dual Tournament RL UI Stability Documentation

## Overview
The dual tournament RL (Reinforcement Learning) UI provides real-time status display for competitive agent execution modes.

## Key Components

### 1. RLAgentStatus Interface
```typescript
export interface RLAgentStatus {
  activeVariant?: 'primary' | 'refiner' | null;
  currentModule?: string;
  currentStep?: string;
  wins?: { primary: number; refiner: number; ties: number };
  scores?: { primary?: number; refiner?: number };
  accuracy?: { primary?: number; refiner?: number };
  parallelExecution?: boolean;
  stepsCompleted?: number;
  totalSteps?: number;
  lastWinner?: 'primary' | 'refiner' | 'tie' | null;
  streak?: number;
}
```

### 2. Status Update Methods
- `updateRLStatus(status: Partial<RLAgentStatus>)`: Update RL status with partial changes
- `clearRLStatus()`: Clear RL status when tournament completes
- `getRLStatus(): Readonly<RLAgentStatus>`: Get current RL status

### 3. Status Bar Integration
RL status is displayed in the terminal status bar when active:
```
[PRI | module-name | step-name | 5-3-1 | 🔥3] [Progress: 12/20 (60%)]
```

Where:
- `PRI`: Primary variant active (green)
- `REF`: Refiner variant active (blue)  
- `5-3-1`: Win counts (primary-refiner-ties)
- `🔥3`: Win streak indicator
- `Progress`: Tournament completion percentage

## Integration Points

### 1. InteractiveShell Integration
```typescript
// Toggle between modes
private handleDualRlToggle(): void {
  const dual = !(toggles?.dualRlEnabled ?? false);
  this.preferredUpgradeMode = dual ? 'dual-rl-continuous' : 'single-continuous';
}
```

### 2. RepoUpgradeOrchestrator Integration
`code`typescript
// Mode definitions
export const REPO_UPGRADE_MODE_DEFINITIONS = {
  'single-continuous': { /* single mode */ },
  'dual-rl-continuous': { /* continuous RL */ },
  'dual-rl-tournament': { /* tournament RL */ }
};
```

### 3. Episodic Memory Integration
```typescript
// Mode selection based on success rate
function chooseRepoUpgradeMode(
  successRate: number
): 'single-continuous' | 'dual-rl-continuous' | 'dual-rl-tournament' {
  if (successRate > 0.9) return 'dual-rl-tournament';
  if (successRate > 0.7) return 'dual-rl-continuous';
  return 'single-continuous';
}
```

## Default Configuration

### Startup Default
```typescript
private preferredUpgradeMode: RepoUpgradeMode = 'single-continuous';
```

### Mode Toggle Behavior
- **Toggle ON**: Switches to `dual-rl-continuous`
- **Toggle OFF**: Switches to `single-continuous`
- **Tournament mode**: Activated via `/upgrade tournament` command

## RL Tournament Flow

### 1. Tournament Initialization
```
updateRLStatus({
  activeVariant: null,
  wins: { primary: 0, refiner: 0, ties: 0 },
  stepsCompleted: 0,
  totalSteps: 20
})
```

### 2. Variant Execution
```
// Primary variant starts
updateRLStatus({
  activeVariant: 'primary',
  currentModule: 'security-fixes',
  currentStep: 'patch-command-injection'
})

// Refiner variant starts  
updateRLStatus({
  activeVariant: 'refiner',
  currentModule: 'security-fixes', 
  currentStep: 'enhance-input-validation'
})
```

### 3. Winner Determination
```
// After tournament round
updateRLStatus({
  wins: { primary: 5, refiner: 3, ties: 1 },
  lastWinner: 'primary',
  streak: 3,
  stepsCompleted: 12
})
```

### 4. Tournament Completion
```
clearRLStatus(); // Clear RL status display
```

## Testing RL UI

### Manual Testing
1. Start interactive shell: `npm start`
2. Toggle dual RL: Use hotkey or `/dual` command
3. Run upgrade: `/upgrade security`
4. Observe RL status in status bar

### Automated Testing
```bash
npm test -- continuous_mode_default.test.ts
node check_continuous_config.cjs
```

## Troubleshooting

### Common Issues
1. **RL status not updating**: Check `updateRLStatus` calls in orchestrator
2. **Status bar flickering**: Ensure status updates are batched
3. **Mode toggle not working**: Verify `handleDualRlToggle` implementation

### Debug Commands
- `/debug rl`: Show current RL status
- `/debug mode`: Show current upgrade mode
- `/debug toggle`: Show toggle states

## Performance Considerations

### Status Update Frequency
- Batch updates to avoid render thrashing
- Use `JSON.stringify` comparison to detect actual changes
- Debounce rapid status updates

### Memory Usage
- RL status objects are small (JSON < 1KB)
- Clear status after tournament completion
- No persistent storage of RL status

## Future Enhancements

### Planned Features
1. **Enhanced visualizations**: Progress bars, win/loss graphs
2. **Historical tracking**: Tournament history persistence
3. **Adaptive scoring**: Dynamic reward weight adjustment
4. **Multi-agent tournaments**: Support for >2 competing agents

### API Stability
- RLAgentStatus interface is stable
- Update methods follow immutable patterns
- Backward compatibility maintained
