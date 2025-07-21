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

    // Create simple swap-based reorganization strategy
    async createMixedTandemReorganization(strategy, sourcePanelId) {
        const swapMoves = [];
        
        console.log(`\n🔄 Creating simple swap strategy for mixed tandems:`);
        console.log(`   Mixed tandems found: ${strategy.mixedTandems.length}`);
        
        // Find all critical single breakers that can be swapped with non-critical tandem slots
        const criticalSingles = strategy.pureUnits.filter(unit => 
            unit.type === 'single_unit' && unit.slots[0].breaker_type === 'single'
        );
        
        console.log(`   Critical single breakers available for swaps: ${criticalSingles.length}`);
        
        // Strategy 1: Swap non-critical tandem slots with critical singles
        const swapPairs = [];
        const usedSingles = new Set();
        const unpairedMixedTandems = [];
        
        for (const mixed of strategy.mixedTandems) {
            const nonCriticalBreaker = mixed.nonCriticalSlots[0]; // Take the first non-critical breaker object
            const criticalBreaker = mixed.criticalSlots[0]; // The critical breaker object that stays
            const nonCriticalSlot = nonCriticalBreaker.slot_position; // Extract the slot position string
            const criticalSlot = criticalBreaker.slot_position; // Extract the slot position string
            
            // Find an unused critical single to swap with
            const availableSingle = criticalSingles.find(single => 
                !usedSingles.has(single.position)
            );
            
            if (availableSingle) {
                usedSingles.add(availableSingle.position);
                
                const singleBreaker = availableSingle.slots[0];
                // nonCriticalBreaker is already defined above
                
                // Create swap moves
                swapPairs.push({
                    type: 'single_to_tandem_swap',
                    mixedPosition: mixed.position,
                    singlePosition: availableSingle.position,
                    criticalSlot: criticalSlot,
                    nonCriticalSlot: nonCriticalSlot,
                    singleBreaker: singleBreaker,
                    nonCriticalBreaker: nonCriticalBreaker
                });
                
                console.log(`   Swap planned: Position ${mixed.position}${nonCriticalSlot} ↔ Position ${availableSingle.position}`);
            } else {
                // No single available - keep for tandem-to-tandem swaps
                unpairedMixedTandems.push(mixed);
            }
        }
        
        // Strategy 2: Swap critical and non-critical slots between remaining mixed tandems
        console.log(`   Unpaired mixed tandems: ${unpairedMixedTandems.length}`);
        
        while (unpairedMixedTandems.length >= 2) {
            const tandem1 = unpairedMixedTandems.shift();
            const tandem2 = unpairedMixedTandems.shift();
            
            const t1Critical = tandem1.criticalSlots[0];
            const t1NonCritical = tandem1.nonCriticalSlots[0];
            const t2Critical = tandem2.criticalSlots[0];
            const t2NonCritical = tandem2.nonCriticalSlots[0];
            
            // Swap: T1's critical goes to T2's non-critical slot, T2's critical goes to T1's non-critical slot
            swapPairs.push({
                type: 'tandem_to_tandem_swap',
                tandem1Position: tandem1.position,
                tandem2Position: tandem2.position,
                t1Critical: t1Critical,
                t1NonCritical: t1NonCritical,
                t2Critical: t2Critical,
                t2NonCritical: t2NonCritical
            });
            
            console.log(`   Tandem swap planned: ${tandem1.position}${t1Critical.slot_position} ↔ ${tandem2.position}${t2NonCritical.slot_position}, ${tandem2.position}${t2Critical.slot_position} ↔ ${tandem1.position}${t1NonCritical.slot_position}`);
        }
        
        // Strategy 3: Any remaining single mixed tandem just moves critical slots only
        for (const remaining of unpairedMixedTandems) {
            console.log(`   ⚠️ Unpaired mixed tandem at position ${remaining.position} - moving critical slots only`);
            const criticalBreakersInMixed = remaining.allSlots.filter(b => b.critical);
            strategy.pureUnits.push({
                type: 'mixed_tandem_unit',
                position: remaining.position,
                slots: criticalBreakersInMixed
            });
        }
        
        // Create the swap moves
        for (const swap of swapPairs) {
            if (swap.type === 'single_to_tandem_swap') {
                const singleSide = this.isLeftSide(swap.singlePosition) ? 'left' : 'right';
                const tandemSide = this.isLeftSide(swap.mixedPosition) ? 'left' : 'right';
                const sideChange = singleSide !== tandemSide;
                
                // Move 1: Single breaker to tandem position
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'swap_for_critical_consolidation',
                    breaker: swap.singleBreaker,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.singlePosition,
                        slot_position: 'single'
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.mixedPosition,
                        slot_position: swap.nonCriticalSlot
                    },
                    description: `Swap: Move critical single from ${swap.singlePosition} to ${swap.mixedPosition}${swap.nonCriticalSlot}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Move 2: Non-critical tandem slot to single position  
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'swap_for_critical_consolidation',
                    breaker: swap.nonCriticalBreaker,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.mixedPosition,
                        slot_position: swap.nonCriticalSlot
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.singlePosition,
                        slot_position: 'single'
                    },
                    description: `Swap: Move non-critical from ${swap.mixedPosition}${swap.nonCriticalSlot} to ${swap.singlePosition}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Update strategy - remove the single unit and convert mixed tandem to pure critical tandem
                strategy.pureUnits = strategy.pureUnits.filter(unit => unit.position !== swap.singlePosition);
                
                // Find the mixed tandem that corresponds to this swap
                const mixedTandem = strategy.mixedTandems.find(m => m.position === swap.mixedPosition);
                const criticalBreaker = mixedTandem.allSlots.find(b => b.slot_position === swap.criticalSlot);
                
                // Update the single breaker to reflect its new position and slot
                const updatedSingleBreaker = {
                    ...swap.singleBreaker,
                    position: swap.mixedPosition,
                    slot_position: swap.nonCriticalSlot
                };
                
                strategy.pureUnits.push({
                    type: 'tandem_unit',
                    position: swap.mixedPosition,
                    slots: [criticalBreaker, updatedSingleBreaker] // Both critical breakers
                });
                
            } else if (swap.type === 'tandem_to_tandem_swap') {
                const t1Side = this.isLeftSide(swap.tandem1Position) ? 'left' : 'right';
                const t2Side = this.isLeftSide(swap.tandem2Position) ? 'left' : 'right';
                const sideChange = t1Side !== t2Side;
                
                // Move 1: T1's critical to T2's non-critical slot
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'tandem_to_tandem_swap',
                    breaker: swap.t1Critical,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.tandem1Position,
                        slot_position: swap.t1Critical.slot_position
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.tandem2Position,
                        slot_position: swap.t2NonCritical.slot_position
                    },
                    description: `Tandem swap: Move critical from ${swap.tandem1Position}${swap.t1Critical.slot_position} to ${swap.tandem2Position}${swap.t2NonCritical.slot_position}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Move 2: T2's non-critical to T1's critical slot
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'tandem_to_tandem_swap',
                    breaker: swap.t2NonCritical,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.tandem2Position,
                        slot_position: swap.t2NonCritical.slot_position
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.tandem1Position,
                        slot_position: swap.t1Critical.slot_position
                    },
                    description: `Tandem swap: Move non-critical from ${swap.tandem2Position}${swap.t2NonCritical.slot_position} to ${swap.tandem1Position}${swap.t1Critical.slot_position}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Move 3: T2's critical to T1's non-critical slot
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'tandem_to_tandem_swap',
                    breaker: swap.t2Critical,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.tandem2Position,
                        slot_position: swap.t2Critical.slot_position
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.tandem1Position,
                        slot_position: swap.t1NonCritical.slot_position
                    },
                    description: `Tandem swap: Move critical from ${swap.tandem2Position}${swap.t2Critical.slot_position} to ${swap.tandem1Position}${swap.t1NonCritical.slot_position}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Move 4: T1's non-critical to T2's critical slot
                swapMoves.push({
                    type: 'swap_move',
                    step: 1,
                    reason: 'tandem_to_tandem_swap',
                    breaker: swap.t1NonCritical,
                    from: {
                        panel_id: sourcePanelId,
                        position: swap.tandem1Position,
                        slot_position: swap.t1NonCritical.slot_position
                    },
                    to: {
                        panel_id: sourcePanelId,
                        position: swap.tandem2Position,
                        slot_position: swap.t2Critical.slot_position
                    },
                    description: `Tandem swap: Move non-critical from ${swap.tandem1Position}${swap.t1NonCritical.slot_position} to ${swap.tandem2Position}${swap.t2Critical.slot_position}`,
                    temporary_disconnect: true,
                    side_change: sideChange
                });
                
                // Update strategy - create two pure critical tandem units
                const updatedT1Critical = {
                    ...swap.t1Critical,
                    position: swap.tandem1Position,
                    slot_position: swap.t1Critical.slot_position
                };
                const updatedT2Critical = {
                    ...swap.t2Critical,
                    position: swap.tandem1Position,
                    slot_position: swap.t1NonCritical.slot_position
                };
                
                strategy.pureUnits.push({
                    type: 'tandem_unit',
                    position: swap.tandem1Position,
                    slots: [updatedT1Critical, updatedT2Critical] // Both critical breakers
                });
                
                const updatedT1CriticalInT2 = {
                    ...swap.t1Critical,
                    position: swap.tandem2Position,
                    slot_position: swap.t2NonCritical.slot_position
                };
                const updatedT2CriticalInT2 = {
                    ...swap.t2Critical,
                    position: swap.tandem2Position,
                    slot_position: swap.t2Critical.slot_position
                };
                
                strategy.pureUnits.push({
                    type: 'tandem_unit',
                    position: swap.tandem2Position,
                    slots: [updatedT1CriticalInT2, updatedT2CriticalInT2] // Both critical breakers
                });
            }
        }
        
        // Update strategy
        strategy.swapMoves = swapMoves;
        strategy.reorganizationMoves = swapMoves; // For compatibility with existing code
        
        console.log(`   ✅ Created ${swapPairs.length} position swaps`);
        console.log(`   📋 Swap moves needed: ${swapMoves.length}`);
        console.log(`   🔄 All swaps keep non-critical breakers in main panel`);
        
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
        }

        // Sort by preference (same side first), then by position
        return available.sort((a, b) => {
            if (a.preferred !== b.preferred) return b.preferred - a.preferred;
            return a.position - b.position;
        });
    }

    // Handle tandem breaker splitting
    async analyzeTandemSplitting() {
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
        for (const [, group] of tandemGroups) {
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
    createProgressiveBatches(swapMoves, criticalMoves) {
        const batches = [];
        
        // Phase 1: Position swaps (allowing temporary disconnections)
        if (swapMoves.length > 0) {
            batches.push({
                batch_number: batches.length + 1,
                type: 'position_swaps',
                moves: swapMoves,
                description: `Position swaps: critical singles ↔ non-critical tandem slots (${swapMoves.length} moves)`,
                allows_temporary_disconnect: true,
                functional_completion: 'All critical breakers consolidated into tandem units'
            });
        }
        
        // Phase 2: Critical moves to target panel (functional batches per unit)
        let remainingCritical = [...criticalMoves];
        while (remainingCritical.length > 0) {
            const batch = [];
            
            // Group moves by physical unit (same source position for tandems)
            if (remainingCritical[0].unit_type === 'tandem_unit' || remainingCritical[0].unit_type === 'mixed_tandem_unit') {
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
            } else if (unitType === 'mixed_tandem_unit') {
                description = `Move critical tandem unit from position ${batch[0].from.position} (${batch.length} slots)`;
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

        // Calculate moves to target panel - only pure critical units
        const unitsToMove = strategy.pureUnits;

        console.log(`\n📦 Units to move to critical panel:`);
        console.log(`   Pure critical units: ${strategy.pureUnits.length}`);
        console.log(`   Total units: ${unitsToMove.length}`);

        // Calculate required space in target panel
        let requiredSpaces = 0;
        for (const unit of unitsToMove) {
            if (unit.type === 'tandem_unit' || unit.type === 'mixed_tandem_unit') {
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

            if (unit.type === 'tandem_unit' || unit.type === 'mixed_tandem_unit') {
                // Critical tandem unit (all slots are critical)
                if (!unit.slots || unit.slots.length === 0) {
                    console.error('Unit has no slots:', unit);
                    continue;
                }
                for (let i = 0; i < unit.slots.length; i++) {
                    const slot = unit.slots[i];
                    if (!slot) {
                        console.error('Slot is undefined at index', i, 'in unit:', unit);
                        continue;
                    }
                    const targetSlot = unit.slots.length === 1 ? 'single' : (i === 0 ? 'A' : 'B');
                    
                    criticalMoves.push({
                        type: 'critical_move',
                        unit_type: unit.type,
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
                        description: `Critical tandem: ${slot.circuit_descriptions?.substring(0, 40) || 'No description'}...`,
                        is_critical_breaker: true
                    });
                }
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
                    description: `Critical ${breaker.breaker_type}: ${breaker.circuit_descriptions?.substring(0, 40) || 'No description'}...`,
                    is_critical_breaker: breaker.critical
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
                swaps_performed: strategy.swapMoves ? strategy.swapMoves.length / 2 : 0,
                total_batches: batches.length
            },
            phases: {
                phase1_swaps: strategy.reorganizationMoves || [],
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
        console.log(`   Swap moves: ${plan.summary.reorganization_moves}`);
        console.log(`   Critical moves: ${plan.summary.critical_moves}`);
        console.log(`   Mixed tandems resolved: ${plan.summary.mixed_tandems}`);
        console.log(`   Pure critical units: ${plan.summary.pure_units}`);
        console.log(`   Position swaps performed: ${plan.summary.swaps_performed}`);
        console.log(`   Functional batches: ${plan.summary.total_batches}`);

        if (plan.phases.phase1_swaps.length > 0) {
            console.log(`\n🔄 PHASE 1 - POSITION SWAPS (${plan.phases.phase1_swaps.length} moves)`);
            console.log(`────────────────────────────────────────`);
            console.log(`Purpose: Swap critical singles with non-critical tandem slots`);
            console.log(`Result: Non-critical breakers stay in main panel, critical tandems ready to move`);
            
            plan.phases.phase1_swaps.forEach((move, i) => {
                console.log(`\n${i + 1}. ${move.description}`);
                console.log(`   From: Panel ${move.from.panel_id}, Position ${move.from.position}${move.from.slot_position}`);
                console.log(`   To:   Panel ${move.to.panel_id}, Position ${move.to.position}${move.to.slot_position}`);
                console.log(`   Reason: ${move.reason}`);
                if (move.side_change) {
                    console.log(`   ⚠️ SIDE CHANGE required`);
                }
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
                console.log(`   ⚠️ SIDE CHANGE required`);
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
            
            // Show which critical breakers are being moved in this batch
            if (batch.type === 'critical_moves') {
                const criticalBreakersInBatch = batch.moves.filter(move => 
                    move.is_critical_breaker === true || (move.breaker && move.breaker.critical)
                );
                const nonCriticalPartnersInBatch = batch.moves.filter(move => 
                    move.is_critical_breaker === false || (move.breaker && !move.breaker.critical && move.unit_type === 'reorganized_tandem_unit')
                );
                
                if (criticalBreakersInBatch.length > 0) {
                    console.log(`   🔋 Critical breakers being moved to critical panel:`);
                    criticalBreakersInBatch.forEach(move => {
                        const desc = move.breaker.circuit_descriptions || 'No description';
                        console.log(`      - ${move.breaker.amperage}A from ${move.from.position}${move.from.slot_position !== 'single' ? move.from.slot_position : ''}: ${desc.substring(0, 50)}...`);
                    });
                }
                
                if (nonCriticalPartnersInBatch.length > 0) {
                    console.log(`   ⚙️ Non-critical partners moving with critical breakers:`);
                    nonCriticalPartnersInBatch.forEach(move => {
                        const desc = move.breaker.circuit_descriptions || 'No description';
                        console.log(`      - ${move.breaker.amperage}A from ${move.from.position}${move.from.slot_position !== 'single' ? move.from.slot_position : ''}: ${desc.substring(0, 50)}...`);
                    });
                }
            }
            
            batch.moves.forEach((move, i) => {
                const fromPanel = move.from.panel_name || `Panel ${move.from.panel_id}`;
                const toPanel = move.to.panel_name || `Panel ${move.to.panel_id}`;
                const fromPos = `${move.from.position}${move.from.slot_position !== 'single' ? move.from.slot_position : ''}`;
                const toPos = `${move.to.position}${move.to.slot_position !== 'single' ? move.to.slot_position : ''}`;
                
                let flags = '';
                if (move.side_change) flags += ' ⚠️ SIDE CHANGE';
                if (move.temporary_disconnect) flags += ' 🔌 temp disconnect OK';
                
                // Add critical indicator
                const isCritical = move.is_critical_breaker === true || (move.breaker && move.breaker.critical);
                const criticalIndicator = isCritical ? '🔋 ' : '';
                
                console.log(`   ${i + 1}. ${criticalIndicator}${fromPanel} ${fromPos} → ${toPanel} ${toPos}${flags}`);
            });
            
            // Show completion status
            if (batch.functional_completion) {
                console.log(`   ✅ Completion: ${batch.functional_completion}`);
            }
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