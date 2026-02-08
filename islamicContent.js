// ═══════════════════════════════════════════════════════════
// 📚 محتوى القسم الإسلامي - موقع الشيخ ابن باز رحمه الله
// ═══════════════════════════════════════════════════════════

const ISLAMIC_CONTENT = {
    
    // ═══════════════════════════════════════════════════════════
    // ⚖️ القسم الأول: الفقهية
    // ═══════════════════════════════════════════════════════════
    
    fiqh: {
        displayName: 'الفقهية',
        emoji: '⚖️',
        
        subsections: {
            
            // 🕌 العبادات
            ibadat: {
                displayName: 'العبادات',
                emoji: '🕌',
                
                topics: {
                    
                    // 🕋 الصلاة
                    salah: {
                        displayName: 'الصلاة',
                        emoji: '🕋',
                        
                        categories: {
                            
                            // حكم الصلاة وأهميتها
                            hukmSalah: {
                                displayName: 'حكم الصلاة وأهميتها',
                                
                                items: [
                                    {
                                        id: 'salah_001',
                                        title: 'الصلاة في الإسلام',
                                        pageUrl: 'https://binbaz.org.sa/audios/187/%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D9%81%D9%8A-%D8%A7%D9%84%D8%A7%D8%B3%D9%84%D8%A7%D9%85',
                                        audioUrl: 'https://files.zadapps.info/binbaz.org.sa/sawtyaat/dros%26mohadrat/ahadeth_eza3a/ahadeth_eza3a_12.mp3',
                                        type: 'lecture'
                                    },
                                    {
                                        id: 'salah_002',
                                        title: 'من حديث: من صلى البردين دخل الجنة',
                                        pageUrl: 'https://binbaz.org.sa/audios/2190/52-%D9%85%D9%86-%D8%AD%D8%AF%D9%8A%D8%AB-%D9%85%D9%86-%D8%B5%D9%84%D9%89-%D8%A7%D9%84%D8%A8%D8%B1%D8%AF%D9%8A%D9%86-%D8%AF%D8%AE%D9%84-%D8%A7%D9%84%D8%AC%D9%86%D8%A9',
                                        audioUrl: 'https://files.zadapps.info/binbaz.org.sa/sawtyaat/shroh_alkotob/ryad_salheen_elias/ryad_salheen_elias051.mp3',
                                        type: 'lecture'
                                    },
                                    {
                                        id: 'salah_003',
                                        title: 'مناصحة تاركي الصلاة المجاورين للمساجد',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1215/%D9%85%D9%86%D8%A7%D8%B5%D8%AD%D8%A9-%D8%AA%D8%A7%D8%B1%D9%83%D9%8A-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D8%A7%D9%84%D9%85%D8%AC%D8%A7%D9%88%D8%B1%D9%8A%D9%86-%D9%84%D9%84%D9%85%D8%B3%D8%A7%D8%AC%D8%AF',
                                        audioUrl: 'https://files.zadapps.info/binbaz.org.sa/fatawa/jame3_kabeer/fjk1_212.mp3',
                                        type: 'fatwa'
                                    },
                                    {
                                        id: 'salah_004',
                                        title: 'حكم ترك الصلاة مع الإقرار بوجوبها',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1403/%D8%AD%D9%83%D9%85-%D8%AA%D8%B1%D9%83-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D9%85%D8%B9-%D8%A7%D9%84%D8%A7%D9%82%D8%B1%D8%A7%D8%B1-%D8%A8%D9%88%D8%AC%D9%88%D8%A8%D9%87%D8%A7',
                                        audioUrl: 'https://files.zadapps.info/binbaz.org.sa/fatawa/jame3_kabeer/fjk1_357.mp3',
                                        type: 'fatwa'
                                    },
                                    {
                                        id: 'salah_005',
                                        title: 'كيف تكون النصيحة والمعاملة لتاركي الصلاة؟',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1522/%D9%83%D9%8A%D9%81-%D8%AA%D9%83%D9%88%D9%86-%D8%A7%D9%84%D9%86%D8%B5%D9%8A%D8%AD%D8%A9-%D9%88%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A9-%D9%84%D8%AA%D8%A7%D8%B1%D9%83%D9%8A-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9',
                                        audioUrl: 'https://files.zadapps.info/binbaz.org.sa/fatawa/jame3_kabeer/fjk1_452.mp3',
                                        type: 'fatwa'
                                    }
                                ]
                            },
                            
                            // سيتم إضافة المزيد لاحقاً
                            rukoo: {
                                displayName: 'الركوع والسجود',
                                items: []
                            },
                            waqtSalah: {
                                displayName: 'وقت الصلاة',
                                items: []
                            },
                            taharah: {
                                displayName: 'الطهارة لصحة الصلاة',
                                items: []
                            }
                        }
                    },
                    
                    // ⚰️ الجنائز
                    janazah: {
                        displayName: 'الجنائز',
                        emoji: '⚰️',
                        categories: {
                            ghuslMayyit: {
                                displayName: 'غسل الميت وتجهيزه',
                                items: []
                            },
                            salahJanazah: {
                                displayName: 'الصلاة على الميت',
                                items: []
                            }
                        }
                    },
                    
                    // 💵 الزكاة
                    zakah: {
                        displayName: 'الزكاة',
                        emoji: '💵',
                        categories: {
                            wujubZakah: {
                                displayName: 'وجوب الزكاة وأهميتها',
                                items: []
                            }
                        }
                    },
                    
                    // 🌙 الصيام
                    siyam: {
                        displayName: 'الصيام',
                        emoji: '🌙',
                        categories: {
                            fadailRamadan: {
                                displayName: 'فضائل رمضان',
                                items: []
                            }
                        }
                    },
                    
                    // 🕋 الحج والعمرة
                    hajj: {
                        displayName: 'الحج والعمرة',
                        emoji: '🕋',
                        categories: {
                            fadailHajj: {
                                displayName: 'فضائل الحج والعمرة',
                                items: []
                            }
                        }
                    },
                    
                    // 💧 الطهارة
                    taharah: {
                        displayName: 'الطهارة',
                        emoji: '💧',
                        categories: {
                            miyah: {
                                displayName: 'المياه',
                                items: []
                            }
                        }
                    },
                    
                    // ⚔️ الجهاد والسير
                    jihad: {
                        displayName: 'الجهاد والسير',
                        emoji: '⚔️',
                        categories: {}
                    }
                }
            },
            
            // 💰 المعاملات
            muamalat: {
                displayName: 'المعاملات',
                emoji: '💰',
                topics: {}
            },
            
            // 👨‍👩‍👧 فقه الأسرة
            fiqhUsrah: {
                displayName: 'فقه الأسرة',
                emoji: '👨‍👩‍👧',
                topics: {}
            },
            
            // 🎯 العادات
            adat: {
                displayName: 'العادات',
                emoji: '🎯',
                topics: {}
            }
        }
    },
    
    // ═══════════════════════════════════════════════════════════
    // 📖 القسم الثاني: الموضوعية
    // ═══════════════════════════════════════════════════════════
    
    mawdooiya: {
        displayName: 'الموضوعية',
        emoji: '📖',
        
        topics: {
            quran: {
                displayName: 'القرآن وعلومه',
                items: []
            },
            aqeedah: {
                displayName: 'العقيدة',
                items: []
            },
            hadith: {
                displayName: 'الحديث وعلومه',
                items: []
            },
            tafsir: {
                displayName: 'التفسير',
                items: []
            },
            dawah: {
                displayName: 'الدعوة والدعاة',
                items: []
            }
        }
    }
};

module.exports = { ISLAMIC_CONTENT };
