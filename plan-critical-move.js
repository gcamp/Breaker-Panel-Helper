#!/usr/bin/env node

/**
 * Critical Breaker Move Planner
 * Creates an optimized plan to move all critical breakers to a target panel
 * 
 * Usage: node plan-critical-move.js [database_path] [target_panel_id]
 * Example: node plan-critical-move.js panel_imported.db 2
 */

const sqlite3 = require('sqlite3').verbose();

class CriticalMovePlanner {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    // Database helper functions
    async dbRun(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    async dbGet(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async dbAll(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Initialize database connection
    async initDatabase() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    // Get all critical breakers - just the critical ones for now
    async getCriticalBreakers() {
        return await this.dbAll(`
            SELECT 
                b.*,
                p.name as panel_name,
                COUNT(c.id) as circuit_count,
                GROUP_CONCAT(c.notes, '; ') as circuit_descriptions
            FROM breakers b
            JOIN panels p ON b.panel_id = p.id
            LEFT JOIN circuits c ON b.id = c.breaker_id
            WHERE b.critical = 1
            GROUP BY b.id
            ORDER BY b.panel_id, b.position, b.slot_position
        `);
    }

    // Analyze mixed tandem breakers and create reorganization strategy
    async createTandemReorganizationStrategy(criticalBreakers, sourcePanelId) {
        const strategy = {
            mixedTandems: [],
            pureUnits: [],
            reorganizationMoves: [],
            criticalMoves: []
        };

        // Find all tandem positions with critical breakers
        const tandemPositions = new Set();
        for (const breaker of criticalBreakers) {
            if (breaker.breaker_type === 'tandem') {
                tandemPositions.add(breaker.position);
            }
        }

        // Analyze each tandem position
        for (const position of tandemPositions) {
            const allSlotsAtPosition = await this.dbAll(`
                SELECT b.*, p.name as panel_name,
                       COUNT(c.id) as circuit_count,
                       GROUP_CONCAT(c.notes, '; ') as circuit_descriptions
                FROM breakers b
                JOIN panels p ON b.panel_id = p.id
                LEFT JOIN circuits c ON b.id = c.breaker_id
                WHERE b.panel_id = ? AND b.position = ? AND b.breaker_type = 'tandem'
                GROUP BY b.id
                ORDER BY b.slot_position
            `, [sourcePanelId, position]);

            const criticalSlots = allSlotsAtPosition.filter(b => b.critical);
            const nonCriticalSlots = allSlotsAtPosition.filter(b => !b.critical);

            if (criticalSlots.length > 0 && nonCriticalSlots.length > 0) {
                // Mixed tandem - needs reorganization
                strategy.mixedTandems.push({
                    position,
                    criticalSlots,
                    nonCriticalSlots,
                    allSlots: allSlotsAtPosition
                });
            } else if (criticalSlots.length > 0) {
                // Pure critical tandem - can move as-is
                strategy.pureUnits.push({
                    type: 'tandem_unit',
                    position,
                    slots: criticalSlots
                });
            }
        }

        // Add non-tandem critical breakers as pure units
        for (const breaker of criticalBreakers) {
            if (breaker.breaker_type !== 'tandem') {
                strategy.pureUnits.push({
                    type: 'single_unit',
                    position: breaker.position,
                    slots: [breaker]
                });
            }
        }

        return strategy;
    }

    // Create sophisticated reorganization plan with temporary disconnections
    async createMixedTandemReorganization(strategy, sourcePanelId) {
        const reorganizationMoves = [];
        const sourcePanel = await this.getPanel(sourcePanelId);
        
        console.log(`\n🔄 Analyzing ${strategy.mixedTandems.length} mixed tandem positions for reorganization:`);
        console.log(`   Using temporary disconnections to enable complex reorganization`);
        
        // Group critical and non-critical breakers by original position
        const criticalBreakers = [];
        const nonCriticalBreakers = [];
        
        for (const mixed of strategy.mixedTandems) {
            console.log(`   Position ${mixed.position}: ${mixed.criticalSlots.length} critical, ${mixed.nonCriticalSlots.length} non-critical`);
            
            for (const critical of mixed.criticalSlots) {
                criticalBreakers.push({
                    breaker: critical,
                    originalPosition: mixed.position,
                    originalSlot: critical.slot_position
                });
            }
            
            for (const nonCritical of mixed.nonCriticalSlots) {
                nonCriticalBreakers.push({
                    breaker: nonCritical,
                    originalPosition: mixed.position,
                    originalSlot: nonCritical.slot_position
                });
            }
        }
        
        console.log(`   Total: ${criticalBreakers.length} critical, ${nonCriticalBreakers.length} non-critical breakers to reorganize`);
        
        // Strategy: Create pairs for new tandem units and separate singles
        const newCriticalUnits = [];
        const remainingNonCritical = [];
        
        // Try to pair each critical breaker with a non-critical from a different position
        for (let i = 0; i < criticalBreakers.length; i++) {
            const critical = criticalBreakers[i];
            
            // Find a non-critical partner from a DIFFERENT position
            const partnerIndex = nonCriticalBreakers.findIndex(nc => 
                nc.originalPosition !== critical.originalPosition
            );
            
            if (partnerIndex >= 0) {
                const partner = nonCriticalBreakers.splice(partnerIndex, 1)[0];
                
                // Use the critical breaker's original position as the target
                const finalPosition = critical.originalPosition;
                
                // Create reorganization moves for this pairing
                // Step 1: Move partner to critical's position (they'll share the tandem)
                reorganizationMoves.push({
                    type: 'reorganize_tandem_pair',
                    step: 1,
                    reason: 'consolidate_critical_pair',
                    breaker: partner.breaker,
                    from: {
                        panel_id: sourcePanelId,
                        position: partner.originalPosition,
                        slot_position: partner.originalSlot
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: finalPosition,
                        slot_position: critical.originalSlot === 'A' ? 'B' : 'A'
                    },
                    description: `Move non-critical ${partner.originalSlot} from ${partner.originalPosition} to ${finalPosition} to pair with critical ${critical.originalSlot}`,
                    temporary_disconnect: true
                });
                
                newCriticalUnits.push({
                    type: 'reorganized_tandem_unit',
                    criticalBreaker: critical,
                    nonCriticalPartner: partner,
                    finalPosition: finalPosition,
                    finalSlots: {
                        critical: critical.originalSlot,
                        nonCritical: critical.originalSlot === 'A' ? 'B' : 'A'
                    }
                });
            } else {
                // No partner available - this critical will be moved as single
                console.log(`   ⚠️ No partner found for critical ${critical.originalPosition}${critical.originalSlot} - will move as single`);
                strategy.pureUnits.push({
                    type: 'single_unit',
                    position: critical.originalPosition,
                    slots: [critical.breaker]
                });
            }
        }
        
        // Handle remaining non-critical breakers
        remainingNonCritical.push(...nonCriticalBreakers);
        
        // Find positions for remaining non-critical breakers
        // We can use positions that will be freed by moving critical pairs
        const positionsToBeFreed = new Set();
        for (const unit of newCriticalUnits) {
            if (unit.nonCriticalPartner.originalPosition !== unit.finalPosition) {
                positionsToBeFreed.add(unit.nonCriticalPartner.originalPosition);
            }
        }
        
        console.log(`   Positions to be freed: ${Array.from(positionsToBeFreed).sort((a,b) => a-b).join(', ')}`);
        
        // Assign freed positions to remaining non-critical breakers
        const freedPositions = Array.from(positionsToBeFreed).sort((a,b) => a-b);
        for (let i = 0; i < remainingNonCritical.length && i < freedPositions.length; i++) {
            const remaining = remainingNonCritical[i];
            const targetPosition = freedPositions[i];
            
            reorganizationMoves.push({
                type: 'reorganize_single',
                step: 2,
                reason: 'place_remaining_non_critical',
                breaker: remaining.breaker,
                from: {
                    panel_id: sourcePanelId,
                    position: remaining.originalPosition,
                    slot_position: remaining.originalSlot
                },
                to: {
                    panel_id: sourcePanelId,
                    position: targetPosition,
                    slot_position: 'single'
                },
                description: `Move remaining non-critical ${remaining.originalSlot} from ${remaining.originalPosition} to freed position ${targetPosition}`,
                temporary_disconnect: true
            });
        }
        
        // Any remaining non-critical breakers that couldn't be placed stay where they are
        // (this shouldn't happen with our example data, but good to handle)
        
        // Update strategy with reorganized units
        strategy.reorganizedUnits = newCriticalUnits;
        strategy.reorganizationMoves = reorganizationMoves;
        
        console.log(`   ✅ Created ${newCriticalUnits.length} reorganized critical tandem units`);
        console.log(`   📋 Reorganization moves needed: ${reorganizationMoves.length}`);
        console.log(`   🔌 All moves allow temporary disconnection for complex reorganization`);
        
        return strategy;
    }

    // Get panel information
    async getPanel(panelId) {
        return await this.dbGet(`
            SELECT 
                p.*,
                COUNT(DISTINCT b.position) as used_positions,
                p.size - COUNT(DISTINCT b.position) as available_positions
            FROM panels p
            LEFT JOIN breakers b ON p.id = b.panel_id
            WHERE p.id = ?
            GROUP BY p.id
        `, [panelId]);
    }

    // Get all panels
    async getAllPanels() {
        return await this.dbAll(`
            SELECT 
                p.*,
                COUNT(DISTINCT b.position) as used_positions,
                p.size - COUNT(DISTINCT b.position) as available_positions
            FROM panels p
            LEFT JOIN breakers b ON p.id = b.panel_id
            GROUP BY p.id
            ORDER BY p.id
        `);
    }

    // Get occupied positions in a panel
    async getOccupiedPositions(panelId) {
        const breakers = await this.dbAll(`
            SELECT position, breaker_type
            FROM breakers 
            WHERE panel_id = ?
            ORDER BY position
        `, [panelId]);

        const occupied = new Set();
        for (const breaker of breakers) {
            occupied.add(breaker.position);
            
            // Double pole breakers occupy the position AND the position + 2
            if (breaker.breaker_type === 'double_pole') {
                occupied.add(breaker.position + 2);
            }
        }
        return occupied;
    }

    // Check if a breaker position is on the left (odd) or right (even) side
    isLeftSide(position) {
        return position % 2 === 1;
    }

    // Find available positions in target panel, preferring same side
    async findAvailablePositions(targetPanelId, targetPanel, preferredSide = null) {
        const occupied = await this.getOccupiedPositions(targetPanelId);
        const available = [];

        for (let pos = 1; pos <= targetPanel.size; pos++) {
            if (!occupied.has(pos)) {
                const isLeft = this.isLeftSide(pos);
                available.push({
                    position: pos,
                    side: isLeft ? 'left' : 'right',
                    preferred: preferredSide ? (isLeft === (preferredSide === 'left')) : true
                });
            }
        };

        // Sort by preference (same side first), then by position
        return available.sort((a, b) => {
            if (a.preferred !== b.preferred) return b.preferred - a.preferred;
            return a.position - b.position;
        });
    }

    // Handle tandem breaker splitting
    async analyzeTandemSplitting(criticalBreakers) {
        // Get ALL tandem breakers (not just critical ones) to analyze mixed tandems
        const allTandemBreakers = await this.dbAll(`
            SELECT * FROM breakers 
            WHERE breaker_type = 'tandem' 
            ORDER BY position, slot_position
        `);

        const tandemGroups = new Map();
        const splitRequirements = [];

        // Group ALL tandem breakers by position
        for (const breaker of allTandemBreakers) {
            const key = `${breaker.panel_id}-${breaker.position}`;
            if (!tandemGroups.has(key)) {
                tandemGroups.set(key, { A: null, B: null, position: breaker.position, panel_id: breaker.panel_id });
            }
            tandemGroups.get(key)[breaker.slot_position] = breaker;
        }

        // Analyze each tandem group
        for (const [key, group] of tandemGroups) {
            const criticalSlots = [];
            const nonCriticalSlots = [];

            if (group.A && group.A.critical) criticalSlots.push('A');
            else if (group.A) nonCriticalSlots.push('A');

            if (group.B && group.B.critical) criticalSlots.push('B');
            else if (group.B) nonCriticalSlots.push('B');

            if (criticalSlots.length > 0 && nonCriticalSlots.length > 0) {
                // This tandem needs splitting
                splitRequirements.push({
                    position: group.position,
                    panel_id: group.panel_id,
                    criticalSlots,
                    nonCriticalSlots,
                    toMove: criticalSlots.map(slot => group[slot]),
                    toReorganize: nonCriticalSlots.map(slot => group[slot])
                });
            }
        }

        return splitRequirements;
    }

    // Create reorganization plan for source panel
    async createReorganizationPlan(splitRequirements, sourcePanelId, positionsToBeFreed = new Set()) {
        const reorganizationMoves = [];
        const sourceOccupied = new Set(await this.getOccupiedPositions(sourcePanelId));
        const sourcePanel = await this.getPanel(sourcePanelId);
        
        // Remove positions that will be freed by critical moves
        for (const pos of positionsToBeFreed) {
            sourceOccupied.delete(pos);
        }

        for (const split of splitRequirements) {
            // Skip if this tandem position will be freed by critical moves
            if (positionsToBeFreed.has(split.position)) {
                console.log(`  Skipping reorganization for position ${split.position} - will be freed by critical moves`);
                continue;
            }

            // Need to find a new position for the non-critical slot
            for (const breaker of split.toReorganize) {
                const currentSide = this.isLeftSide(split.position) ? 'left' : 'right';
                
                // Find truly available positions (not occupied and not already assigned)
                const availablePositions = [];
                for (let pos = 1; pos <= sourcePanel.size; pos++) {
                    if (!sourceOccupied.has(pos) && pos !== split.position) {
                        const isLeft = this.isLeftSide(pos);
                        availablePositions.push({
                            position: pos,
                            side: isLeft ? 'left' : 'right',
                            preferred: isLeft === (currentSide === 'left')
                        });
                    }
                }
                
                // Sort by preference (same side first), then by position
                availablePositions.sort((a, b) => {
                    if (a.preferred !== b.preferred) return b.preferred - a.preferred;
                    return a.position - b.position;
                });
                
                const targetPos = availablePositions[0]; // Take the best available position

                if (targetPos) {
                    reorganizationMoves.push({
                        type: 'reorganize',
                        reason: 'tandem_split',
                        breaker: breaker,
                        from: {
                            panel_id: sourcePanelId,
                            panel_name: sourcePanel.name,
                            position: split.position,
                            slot_position: breaker.slot_position
                        },
                        to: {
                            panel_id: sourcePanelId,
                            panel_name: sourcePanel.name,
                            position: targetPos.position,
                            slot_position: 'single'
                        },
                        side_change: !targetPos.preferred,
                        description: `Move ${breaker.slot_position} slot from ${split.position}${breaker.slot_position} to ${targetPos.position} to free space for critical move`
                    });
                    
                    // Mark this position as now occupied
                    sourceOccupied.add(targetPos.position);
                } else {
                    // If no space available, defer this reorganization until after some critical moves
                    console.log(`  Deferring reorganization for ${split.position}${breaker.slot_position} - no space available yet`);
                }
            }
        }

        return reorganizationMoves;
    }

    // Create progressive delivery batches for safe execution with temporary disconnections
    createProgressiveBatches(reorganizationMoves, criticalMoves) {
        const batches = [];
        
        // Phase 1: Reorganization moves (allowing temporary disconnections)
        if (reorganizationMoves.length > 0) {
            // Group reorganization moves by step
            const step1Moves = reorganizationMoves.filter(m => m.step === 1);
            const step2Moves = reorganizationMoves.filter(m => m.step === 2);
            
            if (step1Moves.length > 0) {
                batches.push({
                    batch_number: batches.length + 1,
                    type: 'reorganization_step1',
                    moves: step1Moves,
                    description: `Reorganize tandems: pair critical breakers with non-critical partners (${step1Moves.length} moves)`,
                    allows_temporary_disconnect: true,
                    functional_completion: 'Critical tandems paired for efficient moving'
                });
            }
            
            if (step2Moves.length > 0) {
                batches.push({
                    batch_number: batches.length + 1,
                    type: 'reorganization_step2', 
                    moves: step2Moves,
                    description: `Place remaining non-critical breakers (${step2Moves.length} moves)`,
                    allows_temporary_disconnect: true,
                    functional_completion: 'All non-critical breakers properly positioned'
                });
            }
        }
        
        // Phase 2: Critical moves to target panel (functional batches per unit)
        let remainingCritical = [...criticalMoves];
        while (remainingCritical.length > 0) {
            const batch = [];
            
            // Group moves by physical unit (same source position for reorganized tandems)
            if (remainingCritical[0].unit_type === 'tandem_unit' || remainingCritical[0].unit_type === 'reorganized_tandem_unit') {
                // Take all moves for this tandem unit
                const unitPosition = remainingCritical[0].from.position;
                while (remainingCritical.length > 0 && remainingCritical[0].from.position === unitPosition) {
                    batch.push(remainingCritical.shift());
                }
            } else {
                // Single/double pole breakers can be moved individually
                batch.push(remainingCritical.shift());
            }
            
            const unitType = batch[0].unit_type;
            const isComplete = remainingCritical.length === 0;
            
            let description;
            if (batch.length === 1) {
                description = `Move critical breaker from position ${batch[0].from.position}`;
            } else if (unitType === 'reorganized_tandem_unit') {
                description = `Move reorganized tandem unit from position ${batch[0].from.position} (${batch.length} slots)`;
            } else {
                description = `Move complete tandem unit from position ${batch[0].from.position} (${batch.length} slots)`;
            }
            
            batches.push({
                batch_number: batches.length + 1,
                type: 'critical_moves',
                moves: batch,
                description: description,
                functional_completion: isComplete ? 'All critical breakers relocated to critical panel' : 'Partial critical move completion'
            });
        }
        
        return batches;
    }

    // Generate the complete move plan with sophisticated reorganization
    async generateMovePlan(targetPanelId) {
        const criticalBreakers = await this.getCriticalBreakers();
        const targetPanel = await this.getPanel(targetPanelId);
        
        if (!targetPanel) {
            throw new Error(`Target panel ${targetPanelId} not found`);
        }

        console.log(`\n🎯 Planning Sophisticated Critical Breaker Relocation`);
        console.log(`📊 Found ${criticalBreakers.length} critical breakers to move`);
        console.log(`🎯 Target Panel: ${targetPanel.name} (${targetPanel.size} spaces, ${targetPanel.available_positions} available)`);

        // Create reorganization strategy for mixed tandems
        const sourcePanelId = criticalBreakers[0]?.panel_id;
        if (!sourcePanelId) {
            throw new Error('No critical breakers found');
        }

        let strategy = await this.createTandemReorganizationStrategy(criticalBreakers, sourcePanelId);
        
        // If we have mixed tandems, create reorganization plan
        if (strategy.mixedTandems.length > 0) {
            strategy = await this.createMixedTandemReorganization(strategy, sourcePanelId);
        }

        // Calculate moves to target panel
        const unitsToMove = [
            ...strategy.pureUnits,
            ...(strategy.reorganizedUnits || [])
        ];

        console.log(`\n📦 Units to move to critical panel:`);
        console.log(`   Pure critical units: ${strategy.pureUnits.length}`);
        console.log(`   Reorganized tandem units: ${(strategy.reorganizedUnits || []).length}`);
        console.log(`   Total units: ${unitsToMove.length}`);

        // Calculate required space in target panel
        let requiredSpaces = 0;
        for (const unit of unitsToMove) {
            if (unit.type === 'tandem_unit' || unit.type === 'reorganized_tandem_unit') {
                requiredSpaces += 1;
            } else {
                const breaker = unit.slots[0];
                requiredSpaces += breaker.breaker_type === 'double_pole' ? 2 : 1;
            }
        }

        if (requiredSpaces > targetPanel.available_positions) {
            throw new Error(`Not enough space in target panel. Need ${requiredSpaces} spaces, have ${targetPanel.available_positions}`);
        }

        // Plan moves to target panel
        const availablePositions = await this.findAvailablePositions(targetPanelId, targetPanel);
        const criticalMoves = [];
        let positionIndex = 0;

        for (const unit of unitsToMove) {
            if (positionIndex >= availablePositions.length) {
                throw new Error('Ran out of available positions in target panel');
            }

            const targetPos = availablePositions[positionIndex];

            if (unit.type === 'tandem_unit') {
                // Pure critical tandem (both slots critical)
                for (let i = 0; i < unit.slots.length; i++) {
                    const slot = unit.slots[i];
                    const targetSlot = unit.slots.length === 1 ? 'single' : (i === 0 ? 'A' : 'B');
                    
                    criticalMoves.push({
                        type: 'critical_move',
                        unit_type: 'tandem_unit',
                        breaker: slot,
                        from: {
                            panel_id: slot.panel_id,
                            panel_name: slot.panel_name,
                            position: slot.position,
                            slot_position: slot.slot_position
                        },
                        to: {
                            panel_id: targetPanelId,
                            panel_name: targetPanel.name,
                            position: targetPos.position,
                            slot_position: targetSlot
                        },
                        side_change: false,
                        description: `Critical tandem: ${slot.circuit_descriptions?.substring(0, 40) || 'No description'}...`
                    });
                }
                positionIndex += 1;
            } else if (unit.type === 'reorganized_tandem_unit') {
                // Reorganized tandem (critical + non-critical partner)
                const critical = unit.criticalBreaker.breaker;
                const nonCritical = unit.nonCriticalPartner.breaker;
                
                criticalMoves.push({
                    type: 'critical_move',
                    unit_type: 'reorganized_tandem_unit',
                    breaker: critical,
                    from: {
                        panel_id: critical.panel_id,
                        panel_name: critical.panel_name,
                        position: unit.finalPosition,
                        slot_position: critical.slot_position
                    },
                    to: {
                        panel_id: targetPanelId,
                        panel_name: targetPanel.name,
                        position: targetPos.position,
                        slot_position: 'A'
                    },
                    side_change: false,
                    description: `Critical reorganized: ${critical.circuit_descriptions?.substring(0, 40) || 'No description'}...`
                });
                
                criticalMoves.push({
                    type: 'critical_move',
                    unit_type: 'reorganized_tandem_unit',
                    breaker: nonCritical,
                    from: {
                        panel_id: nonCritical.panel_id,
                        panel_name: nonCritical.panel_name,
                        position: unit.finalPosition,
                        slot_position: nonCritical.slot_position === critical.slot_position ? (critical.slot_position === 'A' ? 'B' : 'A') : nonCritical.slot_position
                    },
                    to: {
                        panel_id: targetPanelId,
                        panel_name: targetPanel.name,
                        position: targetPos.position,
                        slot_position: 'B'
                    },
                    side_change: false,
                    description: `Non-critical partner: ${nonCritical.circuit_descriptions?.substring(0, 40) || 'No description'}...`
                });
                positionIndex += 1;
            } else {
                // Single unit
                const breaker = unit.slots[0];
                
                criticalMoves.push({
                    type: 'critical_move',
                    unit_type: 'single_unit',
                    breaker: breaker,
                    from: {
                        panel_id: breaker.panel_id,
                        panel_name: breaker.panel_name,
                        position: breaker.position,
                        slot_position: breaker.slot_position
                    },
                    to: {
                        panel_id: targetPanelId,
                        panel_name: targetPanel.name,
                        position: targetPos.position,
                        slot_position: breaker.slot_position
                    },
                    side_change: false,
                    description: `Critical ${breaker.breaker_type}: ${breaker.circuit_descriptions?.substring(0, 40) || 'No description'}...`
                });

                positionIndex += breaker.breaker_type === 'double_pole' ? 2 : 1;
            }
        }

        // Create functional batches
        const batches = this.createProgressiveBatches(strategy.reorganizationMoves || [], criticalMoves);

        return {
            summary: {
                total_moves: (strategy.reorganizationMoves || []).length + criticalMoves.length,
                reorganization_moves: (strategy.reorganizationMoves || []).length,
                critical_moves: criticalMoves.length,
                mixed_tandems: strategy.mixedTandems.length,
                pure_units: strategy.pureUnits.length,
                reorganized_units: (strategy.reorganizedUnits || []).length,
                total_batches: batches.length
            },
            phases: {
                phase1_reorganization: strategy.reorganizationMoves || [],
                phase2_critical_moves: criticalMoves
            },
            progressive_batches: batches,
            strategy: strategy
        };
    }

    // Print the move plan
    printMovePlan(plan) {
        console.log(`\n📋 CRITICAL BREAKER MOVE PLAN`);
        console.log(`════════════════════════════════════════`);
        
        console.log(`\n📊 Summary:`);
        console.log(`   Total moves required: ${plan.summary.total_moves}`);
        console.log(`   Reorganization moves: ${plan.summary.reorganization_moves}`);
        console.log(`   Critical moves: ${plan.summary.critical_moves}`);
        console.log(`   Mixed tandems analyzed: ${plan.summary.mixed_tandems}`);
        console.log(`   Pure critical units: ${plan.summary.pure_units}`);
        console.log(`   Reorganized tandem units: ${plan.summary.reorganized_units}`);
        console.log(`   Functional batches: ${plan.summary.total_batches}`);

        if (plan.phases.phase1_reorganization.length > 0) {
            console.log(`\n🔄 PHASE 1 - REORGANIZATION (${plan.phases.phase1_reorganization.length} moves)`);
            console.log(`────────────────────────────────────────`);
            console.log(`Purpose: Free up space by reorganizing tandem breakers`);
            
            plan.phases.phase1_reorganization.forEach((move, i) => {
                console.log(`\n${i + 1}. ${move.description}`);
                console.log(`   From: Panel ${move.from.panel_id}, Position ${move.from.position}${move.from.slot_position}`);
                console.log(`   To:   Panel ${move.to.panel_id}, Position ${move.to.position}${move.to.slot_position}`);
                console.log(`   Reason: ${move.reason}`);
            });
        }

        console.log(`\n⚡ PHASE 2 - CRITICAL MOVES (${plan.phases.phase2_critical_moves.length} moves)`);
        console.log(`────────────────────────────────────────`);
        console.log(`Purpose: Move all critical breakers to target panel`);
        
        plan.phases.phase2_critical_moves.forEach((move, i) => {
            const criticalLabel = move.breaker.critical ? 'Critical' : 'Non-Critical';
            console.log(`\n${i + 1}. ${criticalLabel} Breaker: ${move.breaker.amperage}A ${move.breaker.breaker_type}`);
            console.log(`   From: ${move.from.panel_name}, Position ${move.from.position}${move.from.slot_position !== 'single' ? move.from.slot_position : ''}`);
            console.log(`   To:   ${move.to.panel_name}, Position ${move.to.position}${move.to.slot_position !== 'single' ? move.to.slot_position : ''}`);
            console.log(`   Circuits: ${move.breaker.circuit_count} circuits`);
            console.log(`   Description: ${move.description}`);
            if (move.side_change) {
                console.log(`   ⚠️ Side change required`);
            }
        });

        // Show progressive batches
        console.log(`\n🚀 PROGRESSIVE DELIVERY PLAN`);
        console.log(`════════════════════════════════════════`);
        console.log(`Execute in ${plan.summary.total_batches} batches for safe delivery:`);
        
        plan.progressive_batches.forEach(batch => {
            console.log(`\n📦 BATCH ${batch.batch_number}: ${batch.description}`);
            console.log(`   Type: ${batch.type.replace('_', ' ').toUpperCase()}`);
            console.log(`   Moves: ${batch.moves.length}`);
            
            batch.moves.forEach((move, i) => {
                const fromPanel = move.from.panel_name || `Panel ${move.from.panel_id}`;
                const toPanel = move.to.panel_name || `Panel ${move.to.panel_id}`;
                const fromPos = `${move.from.position}${move.from.slot_position !== 'single' ? move.from.slot_position : ''}`;
                const toPos = `${move.to.position}${move.to.slot_position !== 'single' ? move.to.slot_position : ''}`;
                
                let flags = '';
                if (move.side_change) flags += ' ⚠️ side change';
                if (move.temporary_disconnect) flags += ' 🔌 temp disconnect OK';
                
                console.log(`   ${i + 1}. ${fromPanel} ${fromPos} → ${toPanel} ${toPos}${flags}`);
            });
        });

        console.log(`\n✅ EXECUTION READY`);
        console.log(`Execute batches sequentially using the move API endpoints.`);
        console.log(`Wait for batch completion before starting the next batch.`);
    }

    // Main planning function
    async plan(targetPanelId) {
        try {
            await this.initDatabase();
            
            const plan = await this.generateMovePlan(targetPanelId);
            this.printMovePlan(plan);
            
            return plan;
            
        } catch (error) {
            console.error('❌ Planning failed:', error.message);
            throw error;
        } finally {
            if (this.db) {
                this.db.close();
            }
        }
    }
}

// Main execution
async function main() {
    const dbPath = process.argv[2] || 'panel_imported.db';
    const targetPanelId = parseInt(process.argv[3]);
    
    if (!targetPanelId) {
        console.error('Usage: node plan-critical-move.js [database_path] [target_panel_id]');
        console.error('Example: node plan-critical-move.js panel_imported.db 2');
        process.exit(1);
    }

    console.log(`🎯 Critical Breaker Move Planner`);
    console.log(`📄 Database: ${dbPath}`);
    console.log(`🎯 Target Panel ID: ${targetPanelId}`);

    const planner = new CriticalMovePlanner(dbPath);
    await planner.plan(targetPanelId);
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = CriticalMovePlanner;