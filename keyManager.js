// ═══════════════════════════════════════════════════════════
// 🔑 نظام تبديل API Keys تلقائي - keyManager.js
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const KEY_STATE_FILE = path.join(__dirname, 'key_state.json');

// ═══════════════════════════════════════════════════════════
// ⚙️ إعدادات الـ Keys والحصص
// ═══════════════════════════════════════════════════════════

// ⭐ أضف كل الـ API keys هنا
const API_KEYS = [
    process.env.AI_API_KEY_1 || '',
    process.env.AI_API_KEY_2 || '',
    process.env.AI_API_KEY_3 || '',  // أضف أكتر لو عندك
].filter(key => key.trim() !== ''); // حذف الفاضي

// ⭐ الحصة اليومية لكل key (حسب GitHub Models)
// gpt-4o-mini = 150 طلب/يوم
// llama-3.3-70b = 150 طلب/يوم
const DAILY_LIMIT = 140; // نستخدم 140 عشان نخلي هامش 10

// ═══════════════════════════════════════════════════════════
// 💾 حفظ وتحميل حالة الـ Keys من ملف
// ═══════════════════════════════════════════════════════════

function loadKeyState() {
    try {
        if (fs.existsSync(KEY_STATE_FILE)) {
            const data = fs.readFileSync(KEY_STATE_FILE, 'utf-8');
            const state = JSON.parse(data);

            // لو التاريخ تغير (يوم جديد) reset كل شي
            if (state.date !== getTodayDate()) {
                console.log('📅 يوم جديد - reset الحصص\n');
                return createFreshState();
            }

            return state;
        }
    } catch (e) {
        console.log('⚠️ خطأ في قراءة حالة الـ Keys\n');
    }
    return createFreshState();
}

function createFreshState() {
    return {
        date: getTodayDate(),
        currentKeyIndex: 0,
        keys: API_KEYS.map((key, i) => ({
            index: i,
            usedToday: 0,
            exhausted: false
        }))
    };
}

function saveKeyState(state) {
    try {
        fs.writeFileSync(KEY_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    } catch (e) {
        console.error('❌ خطأ في حفظ حالة الـ Keys:', e.message);
    }
}

function getTodayDate() {
    // UTC المدني السودان (UTC+3)
    const now = new Date();
    now.setHours(now.getHours() + 3);
    return now.toISOString().split('T')[0]; // "2026-02-03"
}

// ═══════════════════════════════════════════════════════════
// 🔄 الـ Key Manager الرئيسي
// ═══════════════════════════════════════════════════════════

class KeyManager {
    constructor() {
        this.state = loadKeyState();
        this.logStatus();
    }

    // ⭐ جلب الـ Key الحالي
    getCurrentKey() {
        // لو يوم جديد reset
        if (this.state.date !== getTodayDate()) {
            console.log('📅 يوم جديد - reset الحصص');
            this.state = createFreshState();
            saveKeyState(this.state);
            this.logStatus();
        }

        // لو كل الـ Keys نفدت
        if (this.state.currentKeyIndex >= API_KEYS.length) {
            console.log('❌ كل الـ API Keys نفدت الحصة اليومية');
            return null;
        }

        return API_KEYS[this.state.currentKeyIndex];
    }

    // ⭐ زيادة عدد الاستخدام بعد كل رسالة
    incrementUsage() {
        const currentKey = this.state.keys[this.state.currentKeyIndex];
        if (!currentKey) return;

        currentKey.usedToday++;
        saveKeyState(this.state);

        // لو وصلت الحصة تبدل
        if (currentKey.usedToday >= DAILY_LIMIT) {
            this.switchToNextKey();
        }
    }

    // ⭐ التبديل للـ Key التاني
    switchToNextKey() {
        const old = this.state.currentKeyIndex;
        this.state.keys[old].exhausted = true;
        this.state.currentKeyIndex++;
        saveKeyState(this.state);

        if (this.state.currentKeyIndex < API_KEYS.length) {
            console.log(`\n🔄 Key #${old + 1} نفدت الحصة → تبديل لـ Key #${this.state.currentKeyIndex + 1}`);
            console.log(`📊 Key #${this.state.currentKeyIndex + 1}: 0/${DAILY_LIMIT} طلب\n`);
        } else {
            console.log('\n⚠️ كل الـ Keys نفدت الحصة اليومية');
            console.log('⏰ الـ Keys راح تتجدد غداً\n');
        }
    }

    // ⭐ فحص لو في key متاحة
    hasAvailableKey() {
        if (this.state.date !== getTodayDate()) return true; // يوم جديد = كل شي متاح
        return this.state.currentKeyIndex < API_KEYS.length;
    }

    // ⭐ طباعة حالة الـ Keys
    logStatus() {
        console.log('\n🔑 ═══════ حالة الـ API Keys ═══════');
        console.log(`📅 التاريخ: ${this.state.date}`);
        console.log(`🔢 عدد الـ Keys: ${API_KEYS.length}`);
        this.state.keys.forEach((k, i) => {
            const status = k.exhausted ? '🚫 نفدت' : (i === this.state.currentKeyIndex ? '✅ فعال' : '⏳ انتظار');
            console.log(`   Key #${i + 1}: ${k.usedToday}/${DAILY_LIMIT} طلب - ${status}`);
        });
        console.log('═════════════════════════════════\n');
    }
}

// ═══════════════════════════════════════════════════════════
// 📤 تصدير
// ═══════════════════════════════════════════════════════════

module.exports = { KeyManager, DAILY_LIMIT };
