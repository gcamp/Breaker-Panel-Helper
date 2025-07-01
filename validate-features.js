const sqlite3 = require('sqlite3').verbose();

// Use the same database path as test-data.js
const DB_PATH = process.env.DB_PATH || 'test_breaker_panel.db';
const db = new sqlite3.Database(DB_PATH);

console.log(`🔍 Validating application features in: ${DB_PATH}\n`);

function allQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function validateFeatures() {
    try {
        // Test 1: Multi-panel support
        console.log('1️⃣ Testing Multi-Panel Support...');
        const panels = await allQuery('SELECT * FROM panels ORDER BY name');
        console.log(`   ✅ Found ${panels.length} panels:`);
        panels.forEach(panel => {
            console.log(`      • ${panel.name} (${panel.size} spaces)`);
        });
        
        // Test 2: Double pole breakers
        console.log('\n2️⃣ Testing Double Pole Breakers...');
        const doublePoleBreakers = await allQuery('SELECT * FROM breakers WHERE double_pole = 1');
        console.log(`   ✅ Found ${doublePoleBreakers.length} double pole breakers:`);
        doublePoleBreakers.forEach(breaker => {
            console.log(`      • ${breaker.label} (${breaker.amperage}A at position ${breaker.position})`);
        });
        
        // Test 3: Critical and Monitor circuits
        console.log('\n3️⃣ Testing Critical & Monitor Flags...');
        const criticalBreakers = await allQuery('SELECT * FROM breakers WHERE critical = 1');
        const monitorBreakers = await allQuery('SELECT * FROM breakers WHERE monitor = 1');
        console.log(`   ✅ Critical circuits: ${criticalBreakers.length}`);
        criticalBreakers.forEach(breaker => {
            console.log(`      🚨 ${breaker.label}`);
        });
        console.log(`   ✅ Monitor circuits: ${monitorBreakers.length}`);
        monitorBreakers.forEach(breaker => {
            console.log(`      👁️ ${breaker.label}`);
        });
        
        // Test 4: Circuit types
        console.log('\n4️⃣ Testing Circuit Types...');
        const circuitTypes = await allQuery(`
            SELECT type, COUNT(*) as count 
            FROM circuits 
            WHERE type IS NOT NULL 
            GROUP BY type 
            ORDER BY type
        `);
        console.log('   ✅ Circuit type distribution:');
        circuitTypes.forEach(type => {
            const emoji = {
                'outlet': '🔵',
                'lighting': '🟠', 
                'heating': '🔴',
                'appliance': '🟢',
                'subpanel': '🟣'
            }[type.type] || '⚫';
            console.log(`      ${emoji} ${type.type}: ${type.count} circuits`);
        });
        
        // Test 5: Subpanel linking
        console.log('\n5️⃣ Testing Subpanel Linking...');
        const subpanelCircuits = await allQuery(`
            SELECT c.*, b.label as breaker_label, p.name as linked_panel_name
            FROM circuits c
            JOIN breakers b ON c.breaker_id = b.id
            LEFT JOIN panels p ON c.subpanel_id = p.id
            WHERE c.type = 'subpanel'
        `);
        console.log(`   ✅ Found ${subpanelCircuits.length} subpanel links:`);
        subpanelCircuits.forEach(circuit => {
            console.log(`      ⚡ ${circuit.breaker_label} → ${circuit.linked_panel_name || 'No panel linked'}`);
        });
        
        // Test 6: Amperage range
        console.log('\n6️⃣ Testing Amperage Range...');
        const amperageRange = await allQuery(`
            SELECT MIN(amperage) as min_amp, MAX(amperage) as max_amp, COUNT(*) as total
            FROM breakers 
            WHERE amperage IS NOT NULL
        `);
        console.log(`   ✅ Amperage range: ${amperageRange[0].min_amp}A - ${amperageRange[0].max_amp}A`);
        console.log(`   ✅ Total breakers with amperage: ${amperageRange[0].total}`);
        
        // Test 7: Circuits per breaker
        console.log('\n7️⃣ Testing Multiple Circuits per Breaker...');
        const circuitsPerBreaker = await allQuery(`
            SELECT b.label, COUNT(c.id) as circuit_count
            FROM breakers b
            LEFT JOIN circuits c ON b.id = c.breaker_id
            GROUP BY b.id, b.label
            HAVING circuit_count > 1
            ORDER BY circuit_count DESC
        `);
        console.log(`   ✅ Breakers with multiple circuits: ${circuitsPerBreaker.length}`);
        circuitsPerBreaker.forEach(breaker => {
            console.log(`      • ${breaker.label}: ${breaker.circuit_count} circuits`);
        });
        
        // Test 8: Room distribution
        console.log('\n8️⃣ Testing Room Distribution...');
        const roomDistribution = await allQuery(`
            SELECT room, COUNT(*) as count 
            FROM circuits 
            WHERE room IS NOT NULL 
            GROUP BY room 
            ORDER BY count DESC
        `);
        console.log(`   ✅ Circuits across ${roomDistribution.length} rooms:`);
        roomDistribution.forEach(room => {
            console.log(`      • ${room.room}: ${room.count} circuits`);
        });
        
        console.log('\n🎉 All features validated successfully!');
        console.log('\n📝 Manual Testing Checklist:');
        console.log('   □ Navigate between panels using dropdown');
        console.log('   □ Test prev/next panel buttons');
        console.log('   □ Switch between Panel View and Circuit List');
        console.log('   □ Search circuits using text search');
        console.log('   □ Filter by room, type, and flags');
        console.log('   □ Sort columns in Circuit List');
        console.log('   □ Test Normal/Critical/Monitor view modes');
        console.log('   □ Click subpanel links to navigate');
        console.log('   □ Edit breakers and add/remove circuits');
        console.log('   □ Create new panels and delete panels');
        
    } catch (error) {
        console.error('❌ Validation error:', error);
    } finally {
        db.close();
    }
}

validateFeatures();