// ═══════════════════════════════════════════════════════════
// 🕌 محتوى القسم الإسلامي - الأقسام الجديدة
// ═══════════════════════════════════════════════════════════

const ISLAMIC_CONTENT = {
    // ═══ القسم الأول: الفقه ═══
    fiqh: {
        displayName: 'الفقه',
        subsections: {
            // 1. العبادات
            ibadat: {
                displayName: 'العبادات',
                topics: {
                    // 1.1 الصلاة
                    salah: {
                        displayName: 'الصلاة',
                        categories: {
                            hukmSalah: {
                                displayName: 'حكم الصلاة وأهميتها',
                                items: [
                                    {
                                        id: 'salah_001',
                                        title: 'الصلاة في الإسلام',
                                        pageUrl: 'https://binbaz.org.sa/audios/187/%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D9%81%D9%8A-%D8%A7%D9%84%D8%A7%D8%B3%D9%84%D8%A7%D9%85',
                                        type: 'lecture'
                                    },
                                    {
                                        id: 'salah_002',
                                        title: 'من حديث: من صلى البردين دخل الجنة',
                                        pageUrl: 'https://binbaz.org.sa/audios/2190/52-%D9%85%D9%86-%D8%AD%D8%AF%D9%8A%D8%AB-%D9%85%D9%86-%D8%B5%D9%84%D9%89-%D8%A7%D9%84%D8%A8%D8%B1%D8%AF%D9%8A%D9%86-%D8%AF%D8%AE%D9%84-%D8%A7%D9%84%D8%AC%D9%86%D8%A9',
                                        type: 'lecture'
                                    },
                                    {
                                        id: 'salah_003',
                                        title: 'مناصحة تاركي الصلاة المجاورين للمساجد',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1215/%D9%85%D9%86%D8%A7%D8%B5%D8%AD%D8%A9-%D8%AA%D8%A7%D8%B1%D9%83%D9%8A-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D8%A7%D9%84%D9%85%D8%AC%D8%A7%D9%88%D8%B1%D9%8A%D9%86-%D9%84%D9%84%D9%85%D8%B3%D8%A7%D8%AC%D8%AF',
                                        type: 'fatwa'
                                    },
                                    {
                                        id: 'salah_004',
                                        title: 'حكم ترك الصلاة مع الإقرار بوجوبها',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1403/%D8%AD%D9%83%D9%85-%D8%AA%D8%B1%D9%83-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9-%D9%85%D8%B9-%D8%A7%D9%84%D8%A7%D9%82%D8%B1%D8%A7%D8%B1-%D8%A8%D9%88%D8%AC%D9%88%D8%A8%D9%87%D8%A7',
                                        type: 'fatwa'
                                    },
                                    {
                                        id: 'salah_005',
                                        title: 'كيف تكون النصيحة والمعاملة لتاركي الصلاة؟',
                                        pageUrl: 'https://binbaz.org.sa/fatwas/1522/%D9%83%D9%8A%D9%81-%D8%AA%D9%83%D9%88%D9%86-%D8%A7%D9%84%D9%86%D8%B5%D9%8A%D8%AD%D8%A9-%D9%88%D8%A7%D9%84%D9%85%D8%B9%D8%A7%D9%85%D9%84%D8%A9-%D9%84%D8%AA%D8%A7%D8%B1%D9%83%D9%8A-%D8%A7%D9%84%D8%B5%D9%84%D8%A7%D8%A9',
                                        type: 'fatwa'
                                    }
                                ]
                            },
                            rukoo: { displayName: 'الركوع والسجود', items: [] },
                            waqt: { displayName: 'وقت الصلاة', items: [] },
                            taharah: { displayName: 'الطهارة لصحة الصلاة', items: [] },
                            satr: { displayName: 'ستر العورة للمصلي', items: [] },
                            qiblah: { displayName: 'استقبال القبلة', items: [] },
                            qiyam: { displayName: 'القيام في الصلاة', items: [] },
                            takbeer: { displayName: 'التكبير والاستفتاح', items: [] },
                            sujoodTilawa: { displayName: 'سجود التلاوة والشكر', items: [] },
                            adhan: { displayName: 'الأذان والإقامة', items: [] },
                            tashahhud: { displayName: 'التشهد والتسليم', items: [] },
                            sunan: { displayName: 'سنن الصلاة', items: [] },
                            makruhat: { displayName: 'مكروهات الصلاة', items: [] },
                            mubtalat: { displayName: 'مبطلات الصلاة', items: [] },
                            qada: { displayName: 'قضاء الفوائت', items: [] },
                            sahw: { displayName: 'سجود السهو', items: [] },
                            qiraa: { displayName: 'القراءة في الصلاة', items: [] },
                            tatawwu: { displayName: 'صلاة التطوع', items: [] },
                            istisqa: { displayName: 'صلاة الاستسقاء', items: [] },
                            masajid: { displayName: 'المساجد ومواضع السجود', items: [] },
                            mareed: { displayName: 'صلاة المريض', items: [] },
                            khawf: { displayName: 'صلاة الخوف', items: [] },
                            jam3: { displayName: 'أحكام الجمع', items: [] },
                            jumu3a: { displayName: 'صلاة الجمعة', items: [] },
                            eidain: { displayName: 'صلاة العيدين', items: [] },
                            khusoof: { displayName: 'صلاة الخسوف', items: [] },
                            nahy: { displayName: 'أوقات النهي', items: [] },
                            jama3a: { displayName: 'صلاة الجماعة', items: [] },
                            mutafarriqa: { displayName: 'مسائل متفرقة في الصلاة', items: [] },
                            khushu: { displayName: 'الطمأنينة والخشوع', items: [] },
                            sutra: { displayName: 'سترة المصلي', items: [] },
                            niyyah: { displayName: 'النية في الصلاة', items: [] },
                            qunoot: { displayName: 'القنوت في الصلاة', items: [] },
                            lafz: { displayName: 'اللفظ والحركة في الصلاة', items: [] },
                            witr: { displayName: 'الوتر وقيام الليل', items: [] }
                        }
                    },
                    // 1.2 الجنائز
                    janazah: {
                        displayName: 'الجنائز',
                        categories: {
                            ghusl: { displayName: 'غسل الميت وتجهيزه', items: [] },
                            salah: { displayName: 'الصلاة على الميت', items: [] },
                            haml: { displayName: 'حمل الميت ودفنه', items: [] },
                            ziyarah: { displayName: 'زيارة القبور', items: [] },
                            ihdaa: { displayName: 'إهداء القرب للميت', items: [] },
                            hurmah: { displayName: 'حرمة الأموات', items: [] },
                            ta3ziyah: { displayName: 'أحكام التعزية', items: [] },
                            mutafarriqa: { displayName: 'مسائل متفرقة في الجنائز', items: [] },
                            ihtidaar: { displayName: 'الاحتضار وتلقين الميت', items: [] },
                            maqabir: { displayName: 'أحكام المقابر', items: [] },
                            niyaha: { displayName: 'النياحة على الميت', items: [] }
                        }
                    },
                    // 1.3 الزكاة
                    zakah: {
                        displayName: 'الزكاة',
                        categories: {
                            wujoob: { displayName: 'وجوب الزكاة وأهميتها', items: [] },
                            bahima: { displayName: 'زكاة بهيمة الأنعام', items: [] },
                            hubub: { displayName: 'زكاة الحبوب والثمار', items: [] },
                            naqdain: { displayName: 'زكاة النقدين', items: [] },
                            tijara: { displayName: 'زكاة عروض التجارة', items: [] },
                            fitr: { displayName: 'زكاة الفطر', items: [] },
                            ikhraj: { displayName: 'إخراج الزكاة وأهلها', items: [] },
                            sadaqa: { displayName: 'صدقة التطوع', items: [] },
                            mutafarriqa: { displayName: 'مسائل متفرقة في الزكاة', items: [] }
                        }
                    },
                    // 1.4 الصيام
                    siyam: {
                        displayName: 'الصيام',
                        categories: {
                            fadail: { displayName: 'فضائل رمضان', items: [] },
                            maLaYufsid: { displayName: 'ما لا يفسد الصيام', items: [] },
                            ruya: { displayName: 'رؤيا الهلال', items: [] },
                            manYajib: { displayName: 'من يجب عليه الصوم', items: [] },
                            a3dhar: { displayName: 'الأعذار المبيحة للفطر', items: [] },
                            niyyah: { displayName: 'النية في الصيام', items: [] },
                            mufsidat: { displayName: 'مفسدات الصيام', items: [] },
                            jima3: { displayName: 'الجماع في نهار رمضان', items: [] },
                            mustahabbat: { displayName: 'مستحبات الصيام', items: [] },
                            qada: { displayName: 'قضاء الصيام', items: [] },
                            tatawwu: { displayName: 'صيام التطوع', items: [] },
                            i3tikaf: { displayName: 'الاعتكاف وليلة القدر', items: [] },
                            mutafarriqa: { displayName: 'مسائل متفرقة في الصيام', items: [] }
                        }
                    },
                    // 1.5 الحج والعمرة
                    hajj: {
                        displayName: 'الحج والعمرة',
                        categories: {
                            fadail: { displayName: 'فضائل الحج والعمرة', items: [] },
                            hukm: { displayName: 'حكم الحج والعمرة', items: [] },
                            shurut: { displayName: 'شروط الحج', items: [] },
                            ihram: { displayName: 'الإحرام', items: [] },
                            mahzurat: { displayName: 'محظورات الإحرام', items: [] },
                            fidya: { displayName: 'الفدية وجزاء الصيد', items: [] },
                            saydHaram: { displayName: 'صيد الحرم', items: [] },
                            niyaba: { displayName: 'النيابة في الحج', items: [] },
                            mabeetMina: { displayName: 'المبيت بمنى', items: [] },
                            wuqoof: { displayName: 'الوقوف بعرفة', items: [] },
                            mabeetMuzdalifa: { displayName: 'المبيت بمزدلفة', items: [] },
                            tawaf: { displayName: 'الطواف بالبيت', items: [] },
                            sa3y: { displayName: 'السعي', items: [] },
                            ramy: { displayName: 'رمي الجمار', items: [] },
                            ihsaar: { displayName: 'الإحصار', items: [] },
                            hady: { displayName: 'الهدي والأضاحي', items: [] },
                            mutafarriqa: { displayName: 'مسائل متفرقة في الحج والعمرة', items: [] },
                            mawaqeet: { displayName: 'المواقيت', items: [] },
                            tahallul: { displayName: 'التحلل', items: [] }
                        }
                    },
                    // 1.6 الطهارة
                    taharah: {
                        displayName: 'الطهارة',
                        categories: {
                            miyah: { displayName: 'المياه', items: [] },
                            awani: { displayName: 'الآنية', items: [] },
                            qadaHaja: { displayName: 'قضاء الحاجة', items: [] },
                            sunanFitra: { displayName: 'سنن الفطرة', items: [] },
                            wudu: { displayName: 'فروض الوضوء وصفته', items: [] },
                            nawaqid: { displayName: 'نواقض الوضوء', items: [] },
                            maYushara: { displayName: 'ما يشرع له الوضوء', items: [] },
                            mash: { displayName: 'المسح على الخفين', items: [] },
                            ghusl: { displayName: 'الغسل', items: [] },
                            tayammum: { displayName: 'التيمم', items: [] },
                            najasat: { displayName: 'النجاسات وإزالتها', items: [] },
                            haydNifas: { displayName: 'الحيض والنفاس', items: [] },
                            massMushaf: { displayName: 'مس المصحف', items: [] }
                        }
                    },
                    // 1.7 الجهاد
                    jihad: {
                        displayName: 'الجهاد والسير',
                        categories: {
                            ahkam: { displayName: 'أحكام الجهاد', items: [] }
                        }
                    }
                }
            },
            // 2. المعاملات
            muamalat: {
                displayName: 'المعاملات',
                topics: {
                    riba: { displayName: 'الربا والصرف', categories: {} },
                    a3riya: { displayName: 'العارية', categories: {} },
                    sabaq: { displayName: 'السبق والمسابقات', categories: {} },
                    salaf: { displayName: 'السلف والقرض', categories: {} },
                    rahn: { displayName: 'الرهن', categories: {} },
                    iflas: { displayName: 'الإفلاس والحجر', categories: {} },
                    sulh: { displayName: 'الصلح', categories: {} },
                    hawala: { displayName: 'الحوالة', categories: {} },
                    daman: { displayName: 'الضمان والكفالة', categories: {} },
                    sharika: { displayName: 'الشركة', categories: {} },
                    wakala: { displayName: 'الوكالة', categories: {} },
                    buyu: { displayName: 'البيوع', categories: {} },
                    shuf3a: { displayName: 'الشفعة', categories: {} },
                    ghasb: { displayName: 'الغصب', categories: {} },
                    musaqa: { displayName: 'المساقاة والمزارعة', categories: {} },
                    ijara: { displayName: 'الإجارة', categories: {} },
                    ihya: { displayName: 'إحياء الموات', categories: {} },
                    waqf: { displayName: 'الوقف', categories: {} },
                    hiba: { displayName: 'الهبة والعطية', categories: {} },
                    luqata: { displayName: 'اللقطة واللقيط', categories: {} },
                    wasaya: { displayName: 'الوصايا', categories: {} },
                    faraid: { displayName: 'الفرائض', categories: {} },
                    wadi3a: { displayName: 'الوديعة', categories: {} },
                    kasbMuharram: { displayName: 'الكسب المحرم', categories: {} }
                }
            },
            // 3. فقه الأسرة
            fiqhUsrah: {
                displayName: 'فقه الأسرة',
                topics: {
                    zawaj: { displayName: 'الزواج وأحكامه', categories: {} },
                    nazar: { displayName: 'النظر والخلوة والاختلاط', categories: {} },
                    khul3: { displayName: 'الخلع', categories: {} },
                    talaq: { displayName: 'الطلاق', categories: {} },
                    raj3a: { displayName: 'الرجعة', categories: {} },
                    eela: { displayName: 'الإيلاء', categories: {} },
                    dhihar: { displayName: 'الظهار', categories: {} },
                    li3an: { displayName: 'اللعان', categories: {} },
                    idad: { displayName: 'العِدَد', categories: {} },
                    rada3: { displayName: 'الرضاع', categories: {} },
                    nafaqat: { displayName: 'النفقات', categories: {} },
                    hadana: { displayName: 'الحضانة', categories: {} }
                }
            },
            // 4. العادات
            adat: {
                displayName: 'العادات',
                topics: {
                    adat: { displayName: 'عادات وتقاليد', categories: {} }
                }
            }
        }
    },
    
    // ═══ القسم الثاني: الموضوعية ═══
    mawdooiya: {
        displayName: 'الموضوعية',
        topics: {
            quran: { displayName: 'القرآن وعلومه', items: [] },
            aqeedah: { displayName: 'العقيدة', items: [] },
            hadith: { displayName: 'الحديث وعلومه', items: [] },
            tafsir: { displayName: 'التفسير', items: [] },
            da3wa: { displayName: 'الدعوة والدعاة', items: [] },
            firaq: { displayName: 'الفرق والمذاهب', items: [] },
            bida3: { displayName: 'البدع والمحدثات', items: [] },
            usulFiqh: { displayName: 'أصول الفقه', items: [] },
            alim: { displayName: 'العالم والمتعلم', items: [] },
            adab: { displayName: 'الآداب والأخلاق', items: [] },
            fadail: { displayName: 'الفضائل', items: [] },
            raqaiq: { displayName: 'الرقائق', items: [] },
            adhkar: { displayName: 'الأدعية والأذكار', items: [] },
            tarikh: { displayName: 'التاريخ والسيرة', items: [] },
            qadayaMu3asira: { displayName: 'قضايا معاصرة', items: [] },
            qadayaMara: { displayName: 'قضايا المرأة', items: [] },
            lugha: { displayName: 'اللغة العربية', items: [] },
            nasaih: { displayName: 'نصائح وتوجيهات', items: [] },
            tarbiyaAwlad: { displayName: 'تربية الأولاد', items: [] },
            shi3r: { displayName: 'الشعر والأغاني', items: [] },
            muwaddhafin: { displayName: 'أحكام الموظفين', items: [] },
            hayawan: { displayName: 'أحكام الحيوان', items: [] },
            birrWalidain: { displayName: 'بر الوالدين', items: [] },
            mushkilatZawjiya: { displayName: 'المشكلات الزوجية', items: [] },
            qadayaShabab: { displayName: 'قضايا الشباب', items: [] },
            nawazil: { displayName: 'نوازل معاصرة', items: [] },
            ruya: { displayName: 'الرؤى والمنامات', items: [] },
            rudud: { displayName: 'ردود وتعقيبات', items: [] },
            hijra: { displayName: 'الهجرة والابتعاث', items: [] },
            waswas: { displayName: 'الوسواس بأنواعه', items: [] }
        }
    }
};

module.exports = { ISLAMIC_CONTENT };
