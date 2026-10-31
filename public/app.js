document.addEventListener('DOMContentLoaded', () => {

    // ── PWA Service Worker Registration ───────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(reg => {
                reg.update();
            }).catch(err => {
                console.log('SW registration error:', err);
            });
        });
    }

    // ── State ────────────────────────────────────────────────
    let activeChild = JSON.parse(localStorage.getItem('activeChild') || 'null');
    let userRole = localStorage.getItem('userRole');
    let authToken = localStorage.getItem('authToken');
    let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    let currentViewingRecord = null;

    // ── Global Fetch Interceptor (JWT Auth & Auto 401 Handling) ──
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        options = options || {};
        options.headers = options.headers || {};
        const token = localStorage.getItem('authToken');
        if (token) {
            if (options.headers instanceof Headers) {
                options.headers.set('Authorization', `Bearer ${token}`);
            } else if (typeof options.headers === 'object') {
                options.headers['Authorization'] = `Bearer ${token}`;
            }
        }
        const response = await originalFetch(url, options);
        if ((response.status === 401 || response.status === 403) && !String(url).includes('/api/login')) {
            console.warn('Session expired or unauthorized request to ' + url + '. Re-authenticating.');
            localStorage.removeItem('authToken');
            localStorage.removeItem('userRole');
            localStorage.removeItem('currentUser');
            userRole = null;
            authToken = null;
            currentUser = null;
            checkAuth();
        }
        return response;
    };

    // ── Auth ─────────────────────────────────────────────────
    function checkAuth() {
        const loginScreen = document.getElementById('login-screen');
        const appContainer = document.getElementById('app-container');
        authToken = localStorage.getItem('authToken');
        userRole = localStorage.getItem('userRole');

        if (!userRole || !authToken) {
            if (loginScreen) loginScreen.style.display = 'flex';
            if (appContainer) appContainer.style.display = 'none';
            const topHeader = document.getElementById('app-top-header');
            if (topHeader) topHeader.style.display = 'none';
        } else {
            if (loginScreen) loginScreen.style.display = 'none';
            if (appContainer) appContainer.style.display = 'flex';
            
            // Populate user badge in sidebar and top header
            const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const roleLabels = {
                admin: 'Administrator',
                staff: 'Staff (< 8 yrs - EIC)',
                staff8: 'Staff (≥ 8 yrs - TH)',
                autism: 'Staff (Autism / ASD - All Ages)',
                asd: 'Staff (Autism / ASD - All Ages)'
            };
            const displayName = u.fullName || u.username || 'User';
            const displayRole = roleLabels[userRole] || userRole;

            const nameEl = document.getElementById('logged-user-name');
            const roleEl = document.getElementById('logged-user-role');
            if (nameEl) nameEl.textContent = displayName;
            if (roleEl) roleEl.textContent = displayRole;

            const topNameEl = document.getElementById('top-user-name');
            const topRoleEl = document.getElementById('top-user-role');
            if (topNameEl) topNameEl.textContent = displayName;
            if (topRoleEl) topRoleEl.textContent = displayRole;

            const topHeader = document.getElementById('app-top-header');
            if (topHeader) topHeader.style.display = 'flex';

            applyRoleRestrictions();
            if (typeof fetchTherapyFees === 'function') fetchTherapyFees();
            if (typeof fetchTherapists === 'function') fetchTherapists();
        }
    }

    function filterAssessmentCardsForRole() {
        const isAsd = (userRole === 'autism' || userRole === 'asd');
        const isGeneralStaff = (userRole === 'staff' || userRole === 'staff8');
        const isChildAutism = activeChild ? isAutismChild(activeChild) : false;

        document.querySelectorAll('.ap-type-card').forEach(card => {
            const formId = card.getAttribute('data-form-id');
            const isAutism = (formId === 'abc-assessment' || formId === 'isaa-assessment');

            if (isAsd) {
                // In ASD login: ONLY ABC and ISAA assessments are available in the assessment menu!
                card.style.display = isAutism ? 'flex' : 'none';
            } else if (isGeneralStaff) {
                // In other staff logins: other assessment forms are available, ASD assessments hidden
                card.style.display = !isAutism ? 'flex' : 'none';
            } else {
                // Admin: ABC & ISAA assessments are available ONLY for ASD children!
                if (activeChild) {
                    if (isChildAutism) {
                        card.style.display = isAutism ? 'flex' : 'none';
                    } else {
                        card.style.display = !isAutism ? 'flex' : 'none';
                    }
                } else {
                    card.style.display = 'flex';
                }
            }
        });
    }

    function applyRoleRestrictions() {
        const isStaff = userRole === 'staff' || userRole === 'staff8' || userRole === 'autism' || userRole === 'asd';
        const isAsd = userRole === 'autism' || userRole === 'asd';
        const isGeneralStaff = userRole === 'staff' || userRole === 'staff8';
        
        document.querySelectorAll('.admin-only-filter').forEach(el => {
            if (userRole === 'admin') {
                el.style.display = (el.tagName === 'DIV' || el.tagName === 'LI') ? 'flex' : 'inline-block';
            } else {
                el.style.display = 'none';
            }
        });

        // Filter "+ New Assessment" cards
        filterAssessmentCardsForRole();

        // Configure #schedule-category-filter options
        const schedCatFilter = document.getElementById('schedule-category-filter');
        if (schedCatFilter) {
            if (isAsd) {
                schedCatFilter.value = 'asd';
                Array.from(schedCatFilter.options).forEach(opt => {
                    opt.style.display = (opt.value === 'asd' || opt.value === 'all') ? '' : 'none';
                });
            } else if (userRole === 'staff') {
                schedCatFilter.value = 'eic';
                Array.from(schedCatFilter.options).forEach(opt => {
                    opt.style.display = (opt.value === 'eic' || opt.value === 'all') ? '' : 'none';
                });
            } else if (userRole === 'staff8') {
                schedCatFilter.value = 'th';
                Array.from(schedCatFilter.options).forEach(opt => {
                    opt.style.display = (opt.value === 'th' || opt.value === 'all') ? '' : 'none';
                });
            } else {
                Array.from(schedCatFilter.options).forEach(opt => opt.style.display = '');
            }
        }

        // Filter #records-therapy-filter options
        const therapyFilter = document.getElementById('records-therapy-filter');
        if (therapyFilter) {
            Array.from(therapyFilter.options).forEach(opt => {
                const val = opt.value;
                if (val === 'all') {
                    opt.style.display = '';
                    return;
                }
                const isAutism = (val === 'ABC Assessment' || val === 'ISAA Assessment');
                if (isAsd) {
                    opt.style.display = isAutism ? '' : 'none';
                } else if (isGeneralStaff) {
                    opt.style.display = !isAutism ? '' : 'none';
                } else {
                    opt.style.display = '';
                }
            });
            if (isAsd && therapyFilter.value !== 'all' && therapyFilter.value !== 'ABC Assessment' && therapyFilter.value !== 'ISAA Assessment') {
                therapyFilter.value = 'all';
            } else if (isGeneralStaff && (therapyFilter.value === 'ABC Assessment' || therapyFilter.value === 'ISAA Assessment')) {
                therapyFilter.value = 'all';
            }
        }

        let styleEl = document.getElementById('role-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'role-styles';
            document.head.appendChild(styleEl);
        }
        
        if (isStaff) {
            styleEl.textContent = `
                .btn-edit-sm, .btn-delete-sm, .btn-delete-folder, .btn-notice-edit, .btn-notice-delete {
                    display: none !important;
                }
                li[data-target="therapies-settings"], li[data-target="therapists-settings"], li[data-target="user-management"] {
                    display: none !important;
                }
                .edit-attendance {
                    pointer-events: none !important;
                    border: none !important;
                    background: transparent !important;
                    -moz-appearance: textfield;
                }
                .edit-attendance::-webkit-outer-spin-button,
                .edit-attendance::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .btn-delete-attendance {
                    display: none !important;
                }
            `;
            if (isAsd) {
                // In ASD login, hide conduct buttons for non-ASD forms in summaries
                styleEl.textContent += `
                    .btn-conduct-form {
                        display: none !important;
                    }
                `;
            }
        } else {
            styleEl.textContent = '';
        }
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const u = document.getElementById('login-username').value;
            const p = document.getElementById('login-password').value;
            const err = document.getElementById('login-error');
            err.style.display = 'none';

            try {
                const res = await originalFetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u, password: p })
                });
                const data = await res.json();
                if (data.success) {
                    userRole = data.role;
                    authToken = data.token;
                    currentUser = data.user;
                    localStorage.setItem('userRole', userRole);
                    localStorage.setItem('authToken', authToken);
                    localStorage.setItem('currentUser', JSON.stringify(currentUser));
                    checkAuth();
                    if (document.getElementById('records').classList.contains('active')) fetchChildFolders();
                    if (userRole === 'admin') fetchUsers();
                } else {
                    err.textContent = data.error || 'Login failed';
                    err.style.display = 'block';
                }
            } catch (error) {
                err.textContent = 'Server error';
                err.style.display = 'block';
            }
        });
    }

    function performLogout() {
        localStorage.removeItem('userRole');
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        userRole = null;
        authToken = null;
        currentUser = null;
        const lu = document.getElementById('login-username');
        const lp = document.getElementById('login-password');
        if (lu) lu.value = '';
        if (lp) lp.value = '';
        checkAuth();
    }

    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', performLogout);

    // Global Top Header Logout & Password buttons (accessible from every page)
    document.getElementById('top-btn-logout')?.addEventListener('click', performLogout);
    document.querySelectorAll('.btn-av-logout, .btn-logout').forEach(b => b.addEventListener('click', performLogout));
    document.getElementById('top-btn-change-pwd')?.addEventListener('click', () => {
        document.getElementById('btn-open-change-password')?.click();
    });

    checkAuth();

    // ── Navigation ───────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.id === 'nav-logout') return; // Handled by logout listener
            const tid = item.getAttribute('data-target');
            if (tid) switchTab(tid);
        });
    });

    const currentEditingAssessments = {};

    function syncActiveChildAssessments(child) {
        Object.keys(currentEditingAssessments).forEach(k => delete currentEditingAssessments[k]);
        if (!child || !Array.isArray(child.assessments)) return;
        child.assessments.forEach(a => {
            if (a.form_type && a.id) {
                currentEditingAssessments[a.form_type] = a.id;
            }
        });
    }

    async function refreshActiveChildAssessments() {
        if (!activeChild || !activeChild.id) return;
        try {
            const res = await fetch('/api/children/' + activeChild.id);
            if (res.ok) {
                const fullChild = await res.json();
                activeChild.assessments = fullChild.assessments || [];
                const ra = fullChild.assessments?.find(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
                if (ra && ra.data) { activeChild._consultationData = ra.data; activeChild._consultationData = ra.data; activeChild._rapidData = ra.data; }
                localStorage.setItem('activeChild', JSON.stringify(activeChild));
                syncActiveChildAssessments(activeChild);
                updateFormEditBanners();
                prefillFromActive();
                const activeTab = document.querySelector('.tab-content.active, .assessment-pane.active');
                if (activeTab && activeTab.id === 'child-development') {
                    updateDevFormState();
                } else if (activeTab && (activeTab.id === 'consultation-form' || activeTab.id === 'rapid-assessment')) {
                    updateConsultationFormState();
                } else if (activeTab && activeTab.id === 'abc-assessment') {
                    updateAssessmentFormState('ABC Assessment', 'form-abc');
                    calculateAbcScores();
                } else if (activeTab && activeTab.id === 'isaa-assessment') {
                    updateAssessmentFormState('ISAA Assessment', 'form-isaa');
                    calculateIsaaScores();
                }
            }
        } catch (e) {
            console.error('Error refreshing active child assessments:', e);
        }
    }

    function updateFormEditBanners() {
        // Consultation Form Edit Banner
        const rapidBanner = document.getElementById('consultation-form-edit-banner') || document.getElementById('rapid-form-edit-banner');
        const rapidChildName = document.getElementById('consultation-editing-child-name') || document.getElementById('rapid-editing-child-name');
        const btnRapidNew = document.getElementById('btn-consultation-new-child') || document.getElementById('btn-rapid-new-child');
        if (rapidBanner && rapidChildName) {
            if (activeChild && activeChild.id) {
                rapidBanner.style.display = 'flex';
                const adm = activeChild.admission_no ? `[${activeChild.admission_no}] ` : '';
                rapidChildName.textContent = `${adm}${activeChild.name}`;
                if (btnRapidNew) btnRapidNew.style.display = 'inline-flex';
            } else {
                rapidBanner.style.display = 'none';
                if (btnRapidNew) btnRapidNew.style.display = 'none';
            }
        }

        // Child Development Edit Banner
        const devBanner = document.getElementById('dev-form-edit-banner');
        const devChildName = document.getElementById('dev-editing-child-name');
        if (devBanner && devChildName) {
            if (activeChild && currentEditingAssessments['Child Development']) {
                devBanner.style.display = 'flex';
                devChildName.textContent = activeChild.name;
            } else {
                devBanner.style.display = 'none';
            }
        }

        // ABC Assessment Edit Banner
        const abcBanner = document.getElementById('abc-form-edit-banner');
        const abcChildName = document.getElementById('abc-editing-child-name');
        if (abcBanner && abcChildName) {
            if (activeChild && currentEditingAssessments['ABC Assessment']) {
                abcBanner.style.display = 'flex';
                abcChildName.textContent = activeChild.name;
            } else {
                abcBanner.style.display = 'none';
            }
        }

        // ISAA Assessment Edit Banner
        const isaaBanner = document.getElementById('isaa-form-edit-banner');
        const isaaChildName = document.getElementById('isaa-editing-child-name');
        if (isaaBanner && isaaChildName) {
            if (activeChild && currentEditingAssessments['ISAA Assessment']) {
                isaaBanner.style.display = 'flex';
                isaaChildName.textContent = activeChild.name;
            } else {
                isaaBanner.style.display = 'none';
            }
        }
    }

    function switchTab(targetId) {
        const isAsd = (userRole === 'autism' || userRole === 'asd');
        const isGeneralStaff = (userRole === 'staff' || userRole === 'staff8');

        // ASD login: assessment forms from other logins are NOT available!
        if (isAsd && ['consultation-form', 'rapid-assessment', 'child-development', 'physiotherapy', 'speech', 'progress-review'].includes(targetId)) {
            showToast('This assessment form is not available in the ASD login.', true);
            targetId = 'records';
        }

        // ABC & ISAA assessment forms are available ONLY for ASD children!
        if (targetId === 'abc-assessment' || targetId === 'isaa-assessment') {
            if (activeChild && !isAutismChild(activeChild)) {
                showToast('The ABC and ISAA assessment forms are available only for ASD children.', true);
                targetId = 'records';
            } else if (isGeneralStaff) {
                showToast('Autism assessments are restricted to the ASD unit.', true);
                targetId = 'records';
            }
        }

        navItems.forEach(n => {
            if (n.id !== 'nav-logout') {
                const isMatch = n.getAttribute('data-target') === targetId ||
                    (targetId === 'assessment-viewer' && n.getAttribute('data-target') === 'records');
                n.classList.toggle('active', isMatch);
            }
        });
        tabContents.forEach(t => t.classList.toggle('active', t.id === targetId));
        document.querySelectorAll('.assessment-pane').forEach(p => p.classList.toggle('active', p.id === targetId));
        if (targetId === 'records') fetchChildFolders();
        if (targetId === 'assessment-summaries') fetchAndRenderAssessmentSummaries();
        if (targetId === 'user-management') fetchUsers();
        if (targetId === 'therapies-settings') fetchTherapyFees();
        if (targetId === 'therapists-settings') fetchTherapists();
        if (targetId === 'schedule') {
            const schedDate = document.getElementById('schedule-date');
            if (schedDate && !schedDate.value) {
                schedDate.value = getLocalTodayDateString();
            }
            loadDailySchedule();
        }
        if (targetId === 'consultation-form' || targetId === 'rapid-assessment') {
            targetId = 'consultation-form';
            if (!activeChild) primeConsultationAdmissionNo();
            updateConsultationFormState();
        }
        if (targetId === 'child-development') {
            updateDevFormState();
        }
        if (targetId === 'physiotherapy') {
            updateAssessmentFormState('Physiotherapy', 'form-physio');
        }
        if (targetId === 'speech') {
            updateAssessmentFormState('Speech Assessment', 'form-speech');
        }
        if (targetId === 'progress-review') {
            updateAssessmentFormState('Quarterly Progress Review', 'form-progress');
        }
        if (targetId === 'abc-assessment') {
            updateAssessmentFormState('ABC Assessment', 'form-abc');
            calculateAbcScores();
        }
        if (targetId === 'isaa-assessment') {
            updateAssessmentFormState('ISAA Assessment', 'form-isaa');
            calculateIsaaScores();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Inject Back Buttons into Assessment Forms ────────────
    document.querySelectorAll('.assessment-pane .tab-header').forEach(header => {
        const btn = document.createElement('button');
        btn.className = 'btn-back-to-records';
        btn.innerHTML = '← Back to Records';
        btn.type = 'button';
        btn.addEventListener('click', () => switchTab('records'));
        header.insertBefore(btn, header.firstChild);
    });

    // ── Active Child Banner ──────────────────────────────────
    const banner      = document.getElementById('active-child-banner');
    const bannerName  = document.getElementById('active-child-name');
    const btnNew      = document.getElementById('btn-new-child');
    const btnClear    = document.getElementById('btn-clear-child');

    function setActiveChild(child, rapidData) {
        activeChild = child;
        if (child) {
            if (!rapidData && child.assessments) {
                const ra = child.assessments.find(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
                if (ra && ra.data) rapidData = ra.data;
            }
            if (!rapidData && child._consultationData) {
                rapidData = child._consultationData;
            } else if (!rapidData && child._rapidData) {
                rapidData = child._rapidData;
            }
            const toStore = rapidData ? { ...child, _consultationData: rapidData, _rapidData: rapidData } : child;
            localStorage.setItem('activeChild', JSON.stringify(toStore));
            activeChild = toStore;
            syncActiveChildAssessments(toStore);
            if (!toStore.assessments && toStore.id) {
                refreshActiveChildAssessments();
            }
        } else {
            localStorage.removeItem('activeChild');
            Object.keys(currentEditingAssessments).forEach(k => delete currentEditingAssessments[k]);
        }
        updateBanner();
        prefillFromActive();
        updateFormEditBanners();
    }

    function updateBanner() {
        if (activeChild) {
            banner.classList.remove('hidden');
            const admPrefix = activeChild.admission_no ? `[${activeChild.admission_no}] ` : '';
            bannerName.textContent = `${admPrefix}${activeChild.name}`;
            // Show meta details from child profile + rapid assessment data
            const rd = activeChild._consultationData || activeChild._rapidData || {};
            const metaParts = [];
            if (activeChild.admission_no)   metaParts.push('Adm #' + activeChild.admission_no);
            if (activeChild.sex || rd.sex)  metaParts.push(activeChild.sex || rd.sex);
            if (activeChild.dob)            metaParts.push('DOB ' + activeChild.dob);
            if (rd.age)                     metaParts.push('Age ' + rd.age);
            if (activeChild.mobile)         metaParts.push('📱 ' + activeChild.mobile);
            if (rd.diagnosis)               metaParts.push('Dx: ' + rd.diagnosis);
            let metaEl = document.getElementById('active-child-meta');
            if (!metaEl) {
                metaEl = document.createElement('small');
                metaEl.id = 'active-child-meta';
                metaEl.style.cssText = 'display:block;font-size:0.78rem;color:var(--text-light);margin-top:2px;letter-spacing:0.01em;';
                bannerName.insertAdjacentElement('afterend', metaEl);
            }
            metaEl.textContent = metaParts.join(' · ');
        } else {
            banner.classList.add('hidden');
            bannerName.textContent = '—';
            const metaEl = document.getElementById('active-child-meta');
            if (metaEl) metaEl.remove();
        }
    }

    // Auto-calculate Siblings Total (Bros + Sis = Total)
    function calcTotalSiblings(container) {
        if (!container) return;
        const broInp = container.querySelector('input[name="siblings_brothers"]');
        const sisInp = container.querySelector('input[name="siblings_sisters"]');
        const totInp = container.querySelector('input[name="siblings_total"]');
        if (!totInp) return;
        const broVal = broInp && broInp.value.trim() !== '' ? parseInt(broInp.value, 10) : null;
        const sisVal = sisInp && sisInp.value.trim() !== '' ? parseInt(sisInp.value, 10) : null;
        if (broVal === null && sisVal === null) {
            totInp.value = '';
        } else {
            totInp.value = (broVal || 0) + (sisVal || 0);
        }
    }

    // Section 37 Milestones interactive toggle
    function setupMilestoneInteractions(container) {
        if (!container) return;
        container.querySelectorAll('input[type="radio"][name^="ms_"]').forEach(r => {
            r.addEventListener('change', () => {
                const card = r.closest('.milestone-card');
                if (!card) return;
                const delayedBox = card.querySelector('.ms-delayed-box');
                if (!delayedBox) return;
                if (r.checked && r.value.startsWith('>')) {
                    delayedBox.style.display = 'flex';
                    const inp = delayedBox.querySelector('input');
                    if (inp) inp.focus();
                } else if (r.checked && r.value.startsWith('<')) {
                    delayedBox.style.display = 'none';
                    const inp = delayedBox.querySelector('input');
                    if (inp) inp.value = '';
                }
            });
        });
    }

    // Auto-populate Child Development form from Rapid Assessment
    function populateDevFromRapid(force = false) {
        if (!activeChild) {
            if (force) showToast('Please select a child profile first.', true);
            return;
        }
        const devForm = document.getElementById('form-development');
        if (!devForm) return;

        const rd = (activeChild && (activeChild._consultationData || activeChild._rapidData)) || {};

        let ageVal = (activeChild && activeChild.age) || rd.age || '';
        if (!ageVal && (activeChild.dob || rd.dob)) {
            const birthDate = new Date(activeChild.dob || rd.dob);
            if (!isNaN(birthDate.getTime())) {
                const today = (activeChild && activeChild.created_at) ? new Date(activeChild.created_at) : (rd.assessment_date ? new Date(rd.assessment_date) : new Date());
                let years = today.getFullYear() - birthDate.getFullYear();
                let months = today.getMonth() - birthDate.getMonth();
                if (today.getDate() < birthDate.getDate()) months--;
                if (months < 0) { years--; months += 12; }
                ageVal = years > 0 ? `${years}y ${months}m` : `${months}m`;
            }
        }

        const fills = [
            ['input[name="child_name"]',              activeChild.name || ''],
            ['input[name="admission_no"]',            activeChild.admission_no || ''],
            ['select[name="sex"]',                    activeChild.sex || rd.sex || ''],
            ['input[name="dob"]',                     activeChild.dob || rd.dob || ''],
            ['input[name="age"]',                     ageVal],
            ['textarea[name="address"]',              rd.address || ''],
            ['textarea[name="medical_history_dev"]',  rd.medical_history || ''],
            ['textarea[name="previous_therapies"]',   rd.medical_history || ''],
            ['textarea[name="parent_expectations"]',  rd.symptoms || ''],
            ['input[name="parent_expectations"]',     rd.symptoms || ''],
            ['textarea[name="available_aids_appliances"]', rd.po_observation || ''],
            ['input[name="dev_diagnosis"]',           rd.diagnosis || ''],
            ['input[name="father_contact"]',          activeChild.mobile || rd.father_contact || rd.mobile || ''],
            ['input[name="mother_contact"]',          rd.mother_contact || activeChild.mobile || rd.mobile || ''],
            ['input[name="informant"]',               rd.informant || ''],
            ['select[name="relationship"]',           rd.relationship || ''],
            ['input[name="perinatal_others"]',        rd.birth_history || ''],
            ['input[name="height"]',                  rd.height || ''],
            ['input[name="weight"]',                  rd.weight || ''],
            ['input[name="bmi"]',                     rd.bmi || ''],
            ['input[name="head_circ"]',               rd.head_circ || ''],
            ['input[name="chest_circ"]',              rd.chest_circ || ''],
            ['input[name="muac_r"]',                  rd.muac_r || ''],
            ['input[name="muac_l"]',                  rd.muac_l || '']
        ];

        let populatedCount = 0;
        fills.forEach(([sel, val]) => {
            if (!val) return;
            const el = devForm.querySelector(sel);
            if (el) {
                if (force || !el.value || el.value.trim() === '') {
                    el.value = val;
                    populatedCount++;
                }
            }
        });

        if (force) {
            showToast(`✅ Generated details from Consultation Form (${populatedCount} fields updated)!`);
        }
    }

    function populateFormFields(form, data) {
        if (!form || !data) return;
        Object.keys(data).forEach(key => {
            const val = data[key];
            const elements = form.querySelectorAll(`[name="${key}"]`);
            if (!elements.length) return;
            
            elements.forEach(el => {
                if (el.type === 'radio') {
                    el.checked = (el.value === val);
                    if (el.checked && el.name.startsWith('ms_') && el.value.startsWith('>')) {
                        const card = el.closest('.milestone-card');
                        const dBox = card?.querySelector('.ms-delayed-box');
                        if (dBox) dBox.style.display = 'flex';
                    }
                } else if (el.type === 'checkbox') {
                    if (Array.isArray(val)) {
                        el.checked = val.includes(el.value);
                    } else {
                        el.checked = (el.value === val || val === true);
                    }
                } else {
                    if (el.classList && el.classList.contains('abc-score-input')) {
                        // Handle legacy boolean/checkbox or numeric value
                        if (val === true || val === 'on') {
                            el.value = el.getAttribute('data-weight') || '0';
                        } else {
                            el.value = (val !== undefined && val !== null) ? val : '';
                        }
                        const num = parseFloat(el.value);
                        if (!isNaN(num) && num > 0) {
                            el.style.background = '#f5f3ff';
                            el.style.borderColor = '#7c3aed';
                            el.style.color = '#6b21a8';
                        } else {
                            el.style.background = 'white';
                            el.style.borderColor = '#cbd5e1';
                            el.style.color = '#1e293b';
                        }
                    } else {
                        el.value = (val !== undefined && val !== null) ? val : '';
                    }
                }
            });
        });

        // Detail text inputs for delayed milestones
        Object.keys(data).forEach(key => {
            if (key.endsWith('_detail') && data[key]) {
                const inp = form.querySelector(`input[name="${key}"]`);
                if (inp) {
                    inp.value = data[key];
                    const card = inp.closest('.milestone-card');
                    const dBox = card?.querySelector('.ms-delayed-box');
                    if (dBox) dBox.style.display = 'flex';
                }
            }
        });

        calcTotalSiblings(form);

        form.querySelectorAll('.conditional-desc').forEach(desc => {
            const hasVal = Array.from(desc.querySelectorAll('input, select, textarea')).some(i => i.value && i.value.trim());
            if (hasVal) desc.style.display = 'block';
        });

        if (data.photo_base64) {
            const imgEl = form.querySelector('#dev-photo-preview') || form.querySelector('img[id$="-photo-preview"]');
            const phEl = form.querySelector('#photo-placeholder');
            if (imgEl) { imgEl.src = data.photo_base64; imgEl.style.display = 'block'; }
            if (phEl) phEl.style.display = 'none';
        }
    }

    function updateRapidFormState() {
        const rf = document.getElementById('form-consultation') || document.getElementById('form-rapid');
        if (!rf) return;
        updateFormEditBanners();
        if (activeChild && activeChild.id) {
            const rd = activeChild._consultationData || activeChild._rapidData || {};
            const staticAge = rd.age_at_creation || rd.age || activeChild.age_at_creation || activeChild.age || (activeChild.dob ? calcAge(activeChild.dob) : '');
            const liveAge = activeChild.dob ? calcAge(activeChild.dob) : '';
            const populate = [
                ['input[name="child_name"]', activeChild.name || ''],
                ['input[name="admission_no"]', activeChild.admission_no || ''],
                ['select[name="sex"]', activeChild.sex || rd.sex || ''],
                ['input[name="dob"]', activeChild.dob || rd.dob || ''],
                ['input[name="age_at_creation"]', staticAge],
                ['input[name="age"]', staticAge],
                ['input[name="current_live_age"]', liveAge],
                ['textarea[name="address"]', rd.address || ''],
                ['input[name="mobile"]', activeChild.mobile || rd.mobile || ''],
                ['textarea[name="symptoms"]', rd.symptoms || ''],
                ['textarea[name="birth_history"]', rd.birth_history || ''],
                ['textarea[name="medical_history"]', rd.medical_history || ''],
                ['textarea[name="physio_observation"]', rd.physio_observation || ''],
                ['textarea[name="physio_suggestion"]', rd.physio_suggestion || ''],
                ['textarea[name="occupational_observation"]', rd.occupational_observation || ''],
                ['textarea[name="occupational_suggestion"]', rd.occupational_suggestion || ''],
                ['textarea[name="sensory_observation"]', rd.sensory_observation || ''],
                ['textarea[name="sensory_suggestion"]', rd.sensory_suggestion || ''],
                ['textarea[name="speech_observation"]', rd.speech_observation || ''],
                ['textarea[name="speech_suggestion"]', rd.speech_suggestion || ''],
                ['textarea[name="po_observation"]', rd.po_observation || ''],
                ['textarea[name="po_suggestion"]', rd.po_suggestion || ''],
                ['input[name="diagnosis"]', rd.diagnosis || ''],
                ['input[name="finalized_by"]', rd.finalized_by || '']
            ];
            populate.forEach(([sel, val]) => {
                const el = rf.querySelector(sel);
                if (el) el.value = val;
            });
            const dateInp = rf.querySelector('input[name="assessment_date"]');
            if (dateInp && !dateInp.value) {
                dateInp.value = getLocalTodayDateString();
            }
        }
    }
    const updateConsultationFormState = updateRapidFormState;

    function updateDevFormState() {
        const devForm = document.getElementById('form-development');
        if (!devForm) return;
        updateFormEditBanners();
        if (activeChild && currentEditingAssessments['Child Development']) {
            const devAss = activeChild.assessments?.find(a => a.form_type === 'Child Development' && a.id == currentEditingAssessments['Child Development']);
            if (devAss && devAss.data) {
                populateFormFields(devForm, devAss.data);
            }
        } else {
            prefillFromActive();
        }
    }

    function updateAssessmentFormState(formType, formId) {
        const form = document.getElementById(formId);
        if (!form) return;
        prefillFromActive();
        if (activeChild && currentEditingAssessments[formType]) {
            const ass = activeChild.assessments?.find(a => a.form_type === formType && a.id == currentEditingAssessments[formType]);
            if (ass && ass.data) {
                populateFormFields(form, ass.data);
            }
        }
    }

    function prefillFromActive() {
        // ── Lock / fill child name in all assessment forms ──────────────
        const nameFields = [
            document.getElementById('physio-name'),
            document.getElementById('speech-name'),
            document.getElementById('prog-name'),
            document.querySelector('#form-development input[name="child_name"]'),
            document.getElementById('consultation-name'),
            document.getElementById('abc-name'),
            document.getElementById('isaa-name')
        ];
        nameFields.forEach(f => {
            if (!f) return;
            if (activeChild) {
                f.value = activeChild.name;
                f.setAttribute('readonly', true);
                f.style.backgroundColor = '#e8e8e8';
                f.style.cursor = 'not-allowed';
            } else {
                f.value = '';
                f.removeAttribute('readonly');
                f.style.backgroundColor = '';
                f.style.cursor = '';
            }
        });

        // ── Lock / fill admission number in all assessment forms ────
        const admFields = [
            document.getElementById('physio-admission-no'),
            document.getElementById('speech-admission-no'),
            document.getElementById('prog-admission-no'),
            document.querySelector('#form-development input[name="admission_no"]'),
            document.getElementById('consultation-admission-no'),
            document.getElementById('abc-admission-no'),
            document.getElementById('isaa-admission-no')
        ];
        admFields.forEach(f => {
            if (!f) return;
            if (activeChild && activeChild.admission_no) {
                f.value = activeChild.admission_no;
            } else if (!activeChild) {
                f.value = '';
            }
        });

        // ── Fill Date of Birth in all assessment forms ─────────────
        const dobFields = [
            document.getElementById('physio-dob'),
            document.getElementById('speech-dob'),
            document.getElementById('prog-dob'),
            document.querySelector('#form-development input[name="dob"]'),
            document.getElementById('consultation-dob'),
            document.getElementById('abc-dob'),
            document.getElementById('isaa-dob')
        ];
        dobFields.forEach(f => {
            if (!f) return;
            if (activeChild && activeChild.dob) {
                f.value = activeChild.dob;
            } else if (!activeChild) {
                f.value = '';
            }
        });

        // ── Fill Age in all assessment forms ────────────────────────
        const currentAgeStr = activeChild ? (activeChild.age || (activeChild.dob ? calcAge(activeChild.dob) : '')) : '';
        const ageFields = [
            document.getElementById('physio-age'),
            document.getElementById('speech-age'),
            document.getElementById('prog-age'),
            document.querySelector('#form-development input[name="age"]'),
            document.getElementById('consultation-age'),
            document.getElementById('abc-age'),
            document.getElementById('isaa-age')
        ];
        ageFields.forEach(f => {
            if (!f) return;
            if (activeChild && currentAgeStr) {
                f.value = currentAgeStr;
            } else if (!activeChild) {
                f.value = '';
            }
        });

        // ── Fill Sex in all assessment forms ────────────────────────
        const sexFields = [
            document.getElementById('physio-sex'),
            document.getElementById('speech-sex'),
            document.getElementById('prog-sex'),
            document.querySelector('#form-development select[name="sex"]'),
            document.getElementById('consultation-sex'),
            document.getElementById('abc-sex'),
            document.getElementById('isaa-sex')
        ];
        sexFields.forEach(f => {
            if (!f) return;
            if (activeChild && activeChild.sex) {
                f.value = activeChild.sex;
            } else if (!activeChild) {
                f.value = '';
            }
        });

        // ── Ensure assessment date defaults to today if empty ───────
        const dateFields = [
            document.getElementById('physio-date'),
            document.getElementById('speech-date'),
            document.getElementById('prog-date'),
            document.querySelector('#form-development input[name="assessment_date"]'),
            document.getElementById('consultation-date'),
            document.getElementById('abc-date'),
            document.getElementById('isaa-date')
        ];
        dateFields.forEach(f => {
            if (f && !f.value) {
                f.value = getLocalTodayDateString();
            }
        });

        // Auto-fill basic fields in Child Development
        if (activeChild) {
            populateDevFromRapid(false);
        }
    }

    // Attach listeners for Dev form and Rapid form controls
    const devFormEl = document.getElementById('form-development');
    if (devFormEl) {
        devFormEl.querySelectorAll('input[name="siblings_brothers"], input[name="siblings_sisters"]').forEach(inp => {
            inp.addEventListener('input', () => calcTotalSiblings(devFormEl));
            inp.addEventListener('change', () => calcTotalSiblings(devFormEl));
        });
        setupMilestoneInteractions(devFormEl);
    }

    (document.getElementById('btn-import-consultation') || document.getElementById('btn-import-rapid'))?.addEventListener('click', async () => {
        if (!activeChild) {
            showToast('Please open or select a child profile first.', true);
            return;
        }
        if (!activeChild._rapidData && activeChild.id) {
            try {
                const res = await fetch('/api/children/' + activeChild.id);
                if (res.ok) {
                    const cd = await res.json();
                    const ra = cd.assessments?.find(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
                    if (ra && ra.data) {
                        activeChild._consultationData = ra.data; activeChild._rapidData = ra.data;
                        localStorage.setItem('activeChild', JSON.stringify(activeChild));
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        populateDevFromRapid(true);
    });

    document.getElementById('btn-dev-new-version')?.addEventListener('click', () => {
        delete currentEditingAssessments['Child Development'];
        const devForm = document.getElementById('form-development');
        if (devForm) {
            devForm.reset();
            prefillFromActive();
        }
        const devBanner = document.getElementById('dev-form-edit-banner');
        if (devBanner) devBanner.style.display = 'none';
        showToast('Ready to record a fresh Child Development assessment.');
    });

    const handleNewChildInConsultation = async () => {
        setActiveChild(null);
        const cf = document.getElementById('form-consultation') || document.getElementById('form-rapid');
        if (cf) cf.reset();
        const ageAtCreationInp = document.getElementById('consultation-age-at-creation');
        if (ageAtCreationInp) ageAtCreationInp.value = '';
        const liveAgeInp = document.getElementById('consultation-live-age');
        if (liveAgeInp) liveAgeInp.value = '';
        await primeConsultationAdmissionNo();
        const dateInp = cf && cf.querySelector('input[name="assessment_date"]');
        if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];
        showToast('Ready to register a new child.');
    };
    document.getElementById('btn-consultation-new-child')?.addEventListener('click', handleNewChildInConsultation);
    document.getElementById('btn-rapid-new-child')?.addEventListener('click', handleNewChildInConsultation);

    async function fetchNextAdmissionNo(prefix, dob) {
        try {
            let url = '/api/children/next-admission-no';
            const params = new URLSearchParams();
            if (prefix) {
                params.set('prefix', prefix);
            } else if (dob) {
                params.set('dob', dob);
            } else if (userRole === 'staff8') {
                params.set('prefix', 'TH');
            } else if (userRole === 'staff') {
                params.set('prefix', 'EIC');
            }
            const qs = params.toString();
            if (qs) url += '?' + qs;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return data.next_admission_no || '';
            }
        } catch (e) {
            console.error('Error fetching next admission no:', e);
        }
        return '';
    }

    async function primeConsultationAdmissionNo() {
        const admInp = document.getElementById('consultation-admission-no') || document.getElementById('rapid-admission-no');
        if (!admInp) return;
        if (activeChild && activeChild.admission_no) {
            admInp.value = activeChild.admission_no;
        } else {
            const nextAdm = await fetchNextAdmissionNo();
            if (nextAdm && !admInp.value) {
                admInp.value = nextAdm;
            }
        }
        const autismCheck = document.getElementById('consultation-is-autism');
        if (autismCheck) {
            if (userRole === 'autism' || userRole === 'asd') {
                autismCheck.checked = true;
            } else if (activeChild) {
                autismCheck.checked = isAutismChild(activeChild);
            }
        }
    }
    const primeRapidAdmissionNo = primeConsultationAdmissionNo;

    const updateConsultationDobAndAge = async function() {
        const val = document.getElementById('consultation-dob')?.value;
        if (!val) return;
        const birth = new Date(val);
        if (isNaN(birth.getTime())) return;
        const dateInp = document.querySelector('#form-consultation input[name="assessment_date"]') || document.querySelector('#form-rapid input[name="assessment_date"]');
        const ref = dateInp?.value ? new Date(dateInp.value) : new Date();
        const calculatedAgeAtDate = calcAge(val, dateInp?.value || null);
        const liveAge = calcAge(val);

        const ageAtCreationInp = document.getElementById('consultation-age-at-creation');
        const ageInp = document.getElementById('consultation-age') || document.getElementById('rapid-age');
        const liveAgeInp = document.getElementById('consultation-live-age');

        if (liveAgeInp) {
            liveAgeInp.value = liveAge || '';
        }

        // Only calculate static age when creating a new consultation (or if static age is not yet recorded)
        // If an existing child already has a permanent static age, DO NOT overwrite it!
        const existingStaticAge = (activeChild && (activeChild.age_at_creation || activeChild.age)) ||
                                 (currentEditingAssessments['Consultation Form'] && ageAtCreationInp?.value);
        if (!existingStaticAge || !ageAtCreationInp?.value) {
            if (ageAtCreationInp && calculatedAgeAtDate) ageAtCreationInp.value = calculatedAgeAtDate;
            if (ageInp && calculatedAgeAtDate) ageInp.value = calculatedAgeAtDate;
        }

        let years = ref.getFullYear() - birth.getFullYear();
        let months = ref.getMonth() - birth.getMonth();
        if (months < 0 || (months === 0 && ref.getDate() < birth.getDate())) {
            years--;
        }
        const admInp = document.getElementById('consultation-admission-no') || document.getElementById('rapid-admission-no');
        if (admInp) {
            const cur = admInp.value.trim().toUpperCase();
            if (years >= 8 && (!cur || cur.startsWith('EIC'))) {
                const nextNo = await fetchNextAdmissionNo('TH');
                if (nextNo) admInp.value = nextNo;
            } else if (years < 8 && (!cur || cur.startsWith('TH'))) {
                const nextNo = await fetchNextAdmissionNo('EIC');
                if (nextNo) admInp.value = nextNo;
            }
        }
    };
    document.getElementById('consultation-dob')?.addEventListener('change', updateConsultationDobAndAge);
    document.getElementById('consultation-dob')?.addEventListener('input', updateConsultationDobAndAge);
    document.querySelector('#form-consultation input[name="assessment_date"]')?.addEventListener('change', updateConsultationDobAndAge);

    btnNew && btnNew.addEventListener('click', async () => {
        setActiveChild(null);
        const cf = document.getElementById('form-consultation') || document.getElementById('form-rapid');
        cf && cf.reset();
        const ageAtCreationInp = document.getElementById('consultation-age-at-creation');
        if (ageAtCreationInp) ageAtCreationInp.value = '';
        const liveAgeInp = document.getElementById('consultation-live-age');
        if (liveAgeInp) liveAgeInp.value = '';
        switchTab('consultation-form');
        const nextAdm = await fetchNextAdmissionNo();
        const admInp = document.getElementById('consultation-admission-no') || document.getElementById('rapid-admission-no');
        if (admInp && nextAdm) admInp.value = nextAdm;
        const autismCheck = document.getElementById('consultation-is-autism');
        if (autismCheck && (userRole === 'autism' || userRole === 'asd')) autismCheck.checked = true;
        const dateInp = cf && cf.querySelector('input[name="assessment_date"]');
        if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];
        showToast('New Child registration started' + (nextAdm ? ` · Auto Admission No: ${nextAdm}` : ''));
    });

    btnClear && btnClear.addEventListener('click', () => {
        if (confirm('Clear active child? You can resume from Records later.')) {
            setActiveChild(null);
            showToast('Active child cleared.');
        }
    });

    updateBanner();
    prefillFromActive();

    // ── Photo Upload ─────────────────────────────────────────
    const devPhotoInput    = document.getElementById('dev-photo');
    const devPhotoPreview  = document.getElementById('dev-photo-preview');
    const devPhotoBase64   = document.getElementById('dev-photo-base64');
    const photoPlaceholder = document.getElementById('photo-placeholder');

    if (devPhotoInput) {
        devPhotoInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = e => {
                    devPhotoBase64.value = e.target.result;
                    devPhotoPreview.src  = e.target.result;
                    devPhotoPreview.style.display = 'block';
                    if (photoPlaceholder) photoPlaceholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            } else {
                devPhotoBase64.value = '';
                devPhotoPreview.style.display = 'none';
                devPhotoPreview.src = '';
                if (photoPlaceholder) photoPlaceholder.style.display = 'block';
            }
        });
    }

    // ── Conditional Yes/No ───────────────────────────────────
    document.querySelectorAll('.yes-no-select').forEach(sel => {
        sel.addEventListener('change', e => {
            const desc = e.target.parentElement.querySelector('.conditional-desc');
            if (!desc) return;
            const show = e.target.value === 'Yes' || e.target.value === 'Defective';
            desc.style.display = show ? 'block' : 'none';
            if (!show) desc.querySelectorAll('input, select').forEach(i => i.value = '');
        });
    });

    // ── Autism Assessments Scoring & Live Evaluation ────────────
    function calculateAbcScores(container) {
        const root = container || document.getElementById('form-abc') || document;
        const inputs = root.querySelectorAll('.abc-score-input, .abc-checkbox');
        if (!inputs.length) return;

        const sectionTotals = { 'I': 0, 'II': 0, 'III': 0, 'IV': 0, 'V': 0 };
        let totalScore = 0;

        inputs.forEach(inp => {
            const sec = inp.getAttribute('data-section');
            const maxWeight = parseFloat(inp.getAttribute('data-weight')) || 0;
            let val = 0;

            if (inp.type === 'checkbox') {
                val = inp.checked ? maxWeight : 0;
            } else {
                // Decimal or whole number entered by staff (e.g. 0.5, 1.5, 2)
                const rawVal = String(inp.value || '').trim().replace(',', '.');
                val = parseFloat(rawVal);
                if (isNaN(val) || val < 0) val = 0;
                if (maxWeight > 0 && val > maxWeight) {
                    val = maxWeight;
                    inp.value = maxWeight;
                }
                if (val > 0) {
                    inp.style.background = '#f5f3ff';
                    inp.style.borderColor = '#7c3aed';
                    inp.style.color = '#6b21a8';
                } else {
                    inp.style.background = 'white';
                    inp.style.borderColor = '#cbd5e1';
                    inp.style.color = '#1e293b';
                }
            }

            if (sectionTotals[sec] !== undefined) {
                sectionTotals[sec] = parseFloat((sectionTotals[sec] + val).toFixed(2));
            }
            totalScore = parseFloat((totalScore + val).toFixed(2));
        });

        // Update section subtotals with clean decimal display
        ['I', 'II', 'III', 'IV', 'V'].forEach(sec => {
            const subDisplay = root.querySelector('#abc-subtotal-' + sec) || root.querySelector('[data-orig-id="abc-subtotal-' + sec + '"]');
            if (subDisplay) subDisplay.textContent = sectionTotals[sec];
        });

        // Update total score display & input
        const totDisplay = root.querySelector('#abc-total-display') || root.querySelector('[data-orig-id="abc-total-display"]');
        if (totDisplay) totDisplay.textContent = totalScore;
        
        const totInput = root.querySelector('input[name="abc_total_score"]');
        if (totInput) totInput.value = totalScore;

        // Clinical Severity Classification
        // < 47: Low Probability (< 47)
        // 47 - 53: Borderline (47 - 53)
        // 54 - 67: Moderate Autism (54 - 67)
        // > 67: Autism - High Probability (> 67)
        let classification = '';
        let badgeClass = '';
        let scaleKey = '';

        if (totalScore > 67) {
            classification = 'மதியிறுக்கம் / Autism - High Probability (> 67)';
            scaleKey = 'severe';
            badgeClass = 'background: #fee2e2; color: #991b1b; border: 1px solid #f87171;';
        } else if (totalScore >= 54) {
            classification = 'மிதமான மதியிறுக்கம் / Moderate Autism (54 - 67)';
            scaleKey = 'moderate';
            badgeClass = 'background: #fef3c7; color: #92400e; border: 1px solid #fcd34d;';
        } else if (totalScore >= 47) {
            classification = 'நிச்சயமில்லாத நிலை / Borderline (47 - 53)';
            scaleKey = 'borderline';
            badgeClass = 'background: #e0f2fe; color: #075985; border: 1px solid #7dd3fc;';
        } else {
            classification = 'சராசரி (குறைந்த மதியிறுக்க சாத்தியக்கூறு) / Low Probability of ASD (< 47)';
            scaleKey = 'normal';
            badgeClass = 'background: #dcfce7; color: #166534; border: 1px solid #86efac;';
        }

        const badge = root.querySelector('#abc-classification-badge') || root.querySelector('[data-orig-id="abc-classification-badge"]');
        if (badge) {
            badge.innerHTML = '<strong>' + classification + '</strong> (மதிப்பெண்: ' + totalScore + ' / 158)';
            badge.setAttribute('style', 'display: inline-block; font-size: 1.05rem; font-weight: 700; padding: 8px 16px; border-radius: 6px; ' + badgeClass);
        }

        const classInput = root.querySelector('input[name="abc_classification"]');
        if (classInput) classInput.value = classification;

        // Sharp color & style definitions for ABC classification
        const abcConfigs = {
            normal: {
                border: '#16a34a',
                bg: '#f0fdf4',
                color: '#15803d',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#16a34a'
            },
            borderline: {
                border: '#0284c7',
                bg: '#f0f9ff',
                color: '#0369a1',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#0284c7'
            },
            moderate: {
                border: '#ea580c',
                bg: '#fff7ed',
                color: '#c2410c',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#ea580c'
            },
            severe: {
                border: '#dc2626',
                bg: '#fef2f2',
                color: '#b91c1c',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#dc2626'
            }
        };

        const activeCfg = abcConfigs[scaleKey] || abcConfigs.normal;
        if (badge) {
            badge.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${activeCfg.border}; margin-right: 8px; vertical-align: middle;"></span><strong>${classification}</strong> (மதிப்பெண்: ${totalScore} / 158)`;
            badge.setAttribute('style', `display: inline-block; font-size: 1.08rem; font-weight: 800; padding: 10px 18px; border-radius: 6px; background: ${activeCfg.bg}; color: ${activeCfg.color}; border: 2.5px solid ${activeCfg.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);`);
        }

        // Highlight active scale card with sharp high-contrast border and badge
        const scaleCards = {
            normal: root.querySelector('#abc-scale-normal') || root.querySelector('[data-orig-id="abc-scale-normal"]'),
            borderline: root.querySelector('#abc-scale-borderline') || root.querySelector('[data-orig-id="abc-scale-borderline"]'),
            moderate: root.querySelector('#abc-scale-moderate') || root.querySelector('[data-orig-id="abc-scale-moderate"]'),
            severe: root.querySelector('#abc-scale-severe') || root.querySelector('[data-orig-id="abc-scale-severe"]')
        };

        Object.entries(scaleCards).forEach(([k, card]) => {
            if (!card) return;
            const cfg = abcConfigs[k] || abcConfigs.normal;
            if (k === scaleKey) {
                card.classList.add('active-scale');
                card.style.transform = 'translateY(-3px)';
                card.style.border = `3px solid ${cfg.border}`;
                card.style.background = cfg.bg;
                card.style.boxShadow = `0 0 0 2px #ffffff, 0 0 0 5px ${cfg.border}, 0 8px 20px rgba(0, 0, 0, 0.14)`;
                card.style.opacity = '1';
                card.style.position = 'relative';
                card.style.zIndex = '2';

                // Sharp active badge tag inside the card
                let pill = card.querySelector('.scale-active-badge');
                if (!pill) {
                    pill = document.createElement('div');
                    pill.className = 'scale-active-badge';
                    card.insertBefore(pill, card.firstChild);
                }
                pill.textContent = cfg.badgeText;
                pill.setAttribute('style', `display: inline-block; font-size: 0.72rem; font-weight: 800; background: ${cfg.badgeBg}; color: #ffffff; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 1px 3px rgba(0,0,0,0.12);`);
            } else {
                card.classList.remove('active-scale');
                card.style.transform = '';
                card.style.border = '1.5px solid #cbd5e1';
                card.style.background = '#ffffff';
                card.style.boxShadow = 'none';
                card.style.opacity = '0.55';
                card.style.zIndex = '1';
                const pill = card.querySelector('.scale-active-badge');
                if (pill) pill.remove();
            }
        });
    }

    function calculateIsaaScores(container) {
        const root = container || document.getElementById('form-isaa') || document;
        const radios = root.querySelectorAll('.isaa-radio');
        if (!radios.length) return;

        const sectionTotals = { 'I': 0, 'II': 0, 'III': 0, 'IV': 0, 'V': 0, 'VI': 0 };
        let totalScore = 0;
        const answeredQuestions = new Set();

        radios.forEach(r => {
            if (r.checked) {
                const sec = r.getAttribute('data-section');
                const val = parseInt(r.value, 10) || 0;
                if (sectionTotals[sec] !== undefined) {
                    sectionTotals[sec] += val;
                }
                totalScore += val;
                answeredQuestions.add(r.name);
            }
        });
        const answeredCount = answeredQuestions.size;

        // Update section subtotals
        ['I', 'II', 'III', 'IV', 'V', 'VI'].forEach(sec => {
            const subDisplay = root.querySelector('#isaa-subtotal-' + sec) || root.querySelector('[data-orig-id="isaa-subtotal-' + sec + '"]');
            if (subDisplay) subDisplay.textContent = sectionTotals[sec];
        });

        // Update total score display & input
        const totDisplay = root.querySelector('#isaa-total-display') || root.querySelector('[data-orig-id="isaa-total-display"]');
        if (totDisplay) totDisplay.textContent = totalScore;
        
        const totInput = root.querySelector('input[name="isaa_total_score"]');
        if (totInput) totInput.value = totalScore;

        // Clinical Severity Classification
        // < 70: No Autism (< 70)
        // 70 - 107: Mild Autism (70 - 107)
        // 108 - 153: Moderate Autism (108 - 153)
        // > 153: Severe Autism (> 153)
        let classification = '';
        let badgeClass = '';
        let scaleKey = '';

        if (answeredCount === 0) {
            classification = '— (அனைத்து வினாக்களுக்கும் மதிப்பெண் அளிக்கவும்)';
            badgeClass = 'background: #f1f5f9; color: #1e293b; border: 1px solid #e2e8f0;';
        } else if (totalScore > 153) {
            classification = 'கடுமையான மதியிறுக்கம் / Severe Autism (> 153)';
            scaleKey = 'severe';
            badgeClass = 'background: #fee2e2; color: #991b1b; border: 1px solid #f87171;';
        } else if (totalScore >= 108) {
            classification = 'மிதமான மதியிறுக்கம் / Moderate Autism (108 - 153)';
            scaleKey = 'moderate';
            badgeClass = 'background: #ffedd5; color: #9a3412; border: 1px solid #fdba74;';
        } else if (totalScore >= 70) {
            classification = 'ஓரளவு மதியிறுக்கம் / Mild Autism (70 - 107)';
            scaleKey = 'mild';
            badgeClass = 'background: #fef9c3; color: #854d0e; border: 1px solid #fde047;';
        } else {
            classification = 'மதியிறுக்கம் இல்லை / No Autism (< 70)';
            scaleKey = 'noautism';
            badgeClass = 'background: #dcfce7; color: #166534; border: 1px solid #86efac;';
        }

        const badge = root.querySelector('#isaa-classification-badge') || root.querySelector('[data-orig-id="isaa-classification-badge"]');
        if (badge) {
            badge.innerHTML = '<strong>' + classification + '</strong> (மதிப்பெண்: ' + totalScore + ' / 200 · வினாக்கள்: ' + answeredCount + ' / 40)';
            badge.setAttribute('style', 'display: inline-block; font-size: 1.05rem; font-weight: 700; padding: 8px 16px; border-radius: 6px; ' + badgeClass);
        }

        const classInput = root.querySelector('input[name="isaa_classification"]');
        if (classInput) classInput.value = classification;

        // Sharp color & style definitions for ISAA classification
        const isaaConfigs = {
            noautism: {
                border: '#16a34a',
                bg: '#f0fdf4',
                color: '#15803d',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#16a34a'
            },
            mild: {
                border: '#ca8a04',
                bg: '#fefce8',
                color: '#854d0e',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#ca8a04'
            },
            moderate: {
                border: '#ea580c',
                bg: '#fff7ed',
                color: '#c2410c',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#ea580c'
            },
            severe: {
                border: '#dc2626',
                bg: '#fef2f2',
                color: '#b91c1c',
                badgeText: '✓ CURRENT RESULT',
                badgeBg: '#dc2626'
            }
        };

        const activeIsaaCfg = isaaConfigs[scaleKey] || isaaConfigs.noautism;
        if (badge) {
            badge.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${activeIsaaCfg.border}; margin-right: 8px; vertical-align: middle;"></span><strong>${classification}</strong> (மதிப்பெண்: ${totalScore} / 200 · வினாக்கள்: ${answeredCount} / 40)`;
            badge.setAttribute('style', `display: inline-block; font-size: 1.08rem; font-weight: 800; padding: 10px 18px; border-radius: 6px; background: ${activeIsaaCfg.bg}; color: ${activeIsaaCfg.color}; border: 2.5px solid ${activeIsaaCfg.border}; box-shadow: 0 2px 8px rgba(0,0,0,0.08);`);
        }

        // Highlight active scale card with sharp high-contrast border and badge
        const scaleCards = {
            noautism: root.querySelector('#isaa-scale-noautism') || root.querySelector('[data-orig-id="isaa-scale-noautism"]'),
            mild: root.querySelector('#isaa-scale-mild') || root.querySelector('[data-orig-id="isaa-scale-mild"]'),
            moderate: root.querySelector('#isaa-scale-moderate') || root.querySelector('[data-orig-id="isaa-scale-moderate"]'),
            severe: root.querySelector('#isaa-scale-severe') || root.querySelector('[data-orig-id="isaa-scale-severe"]')
        };

        Object.entries(scaleCards).forEach(([k, card]) => {
            if (!card) return;
            const cfg = isaaConfigs[k] || isaaConfigs.noautism;
            if (k === scaleKey) {
                card.classList.add('active-scale');
                card.style.transform = 'translateY(-3px)';
                card.style.border = `3px solid ${cfg.border}`;
                card.style.background = cfg.bg;
                card.style.boxShadow = `0 0 0 2px #ffffff, 0 0 0 5px ${cfg.border}, 0 8px 20px rgba(0, 0, 0, 0.14)`;
                card.style.opacity = '1';
                card.style.position = 'relative';
                card.style.zIndex = '2';

                let pill = card.querySelector('.scale-active-badge');
                if (!pill) {
                    pill = document.createElement('div');
                    pill.className = 'scale-active-badge';
                    card.insertBefore(pill, card.firstChild);
                }
                pill.textContent = cfg.badgeText;
                pill.setAttribute('style', `display: inline-block; font-size: 0.72rem; font-weight: 800; background: ${cfg.badgeBg}; color: #ffffff; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 1px 3px rgba(0,0,0,0.12);`);
            } else {
                card.classList.remove('active-scale');
                card.style.transform = '';
                card.style.border = '1.5px solid #cbd5e1';
                card.style.background = '#ffffff';
                card.style.boxShadow = 'none';
                card.style.opacity = '0.55';
                card.style.zIndex = '1';
                const pill = card.querySelector('.scale-active-badge');
                if (pill) pill.remove();
            }
        });
    }

    // Live Input & Change Event Delegation for Autism Assessments (ABC score inputs & ISAA radio)
    ['input', 'change'].forEach(evtType => {
        document.addEventListener(evtType, e => {
            if (!e.target) return;
            if (e.target.classList && (e.target.classList.contains('abc-score-input') || e.target.classList.contains('abc-checkbox'))) {
                const form = e.target.closest('form') || document.getElementById('form-abc');
                calculateAbcScores(form);
            }
            if (e.target.classList && e.target.classList.contains('isaa-radio')) {
                const form = e.target.closest('form') || document.getElementById('form-isaa');
                calculateIsaaScores(form);
            }
        });
    });

    // Double-click row or input to quickly toggle between 0 and max marks
    document.addEventListener('dblclick', e => {
        const inp = e.target.classList?.contains('abc-score-input') 
            ? e.target 
            : e.target.closest('tr')?.querySelector('.abc-score-input');
        if (inp && !inp.hasAttribute('readonly') && !inp.hasAttribute('disabled')) {
            const maxW = parseFloat(inp.getAttribute('data-weight')) || 0;
            const currentVal = parseFloat(inp.value) || 0;
            inp.value = (currentVal >= maxW) ? '' : maxW;
            const form = inp.closest('form') || document.getElementById('form-abc');
            calculateAbcScores(form);
        }
    });

    // Start fresh assessment button listeners
    const btnAbcNew = document.getElementById('btn-abc-new-version');
    if (btnAbcNew) {
        btnAbcNew.addEventListener('click', () => {
            delete currentEditingAssessments['ABC Assessment'];
            const f = document.getElementById('form-abc');
            if (f) {
                f.reset();
                f.querySelectorAll('.abc-score-input').forEach(inp => {
                    inp.value = '';
                    inp.style.background = 'white';
                    inp.style.borderColor = '#cbd5e1';
                    inp.style.color = '#1e293b';
                });
            }
            prefillFromActive();
            calculateAbcScores();
            updateFormEditBanners();
            showToast('Started fresh ABC Assessment for ' + (activeChild ? activeChild.name : 'child'));
        });
    }

    const btnIsaaNew = document.getElementById('btn-isaa-new-version');
    if (btnIsaaNew) {
        btnIsaaNew.addEventListener('click', () => {
            delete currentEditingAssessments['ISAA Assessment'];
            const f = document.getElementById('form-isaa');
            if (f) f.reset();
            prefillFromActive();
            calculateIsaaScores();
            updateFormEditBanners();
            showToast('Started fresh ISAA Assessment for ' + (activeChild ? activeChild.name : 'child'));
        });
    }

    // ── Setup BMI Auto-Calculation ──────────────────────────────
    window.setupBmiAutoCalc = function(formEl) {
        if (!formEl) return;
        const hi = formEl.querySelector('input[name="height"]');
        const wi = formEl.querySelector('input[name="weight"]');
        const bi = formEl.querySelector('input[name="bmi"]');
        
        // Some forms might not have these directly, fallback if not
        const sexSel = formEl.querySelector('select[name="sex"]') || formEl.querySelector('input[name="sex"]');
        const dobInput = formEl.querySelector('input[name="dob"]');
        
        if (hi && wi && bi) {
            // Approx CDC BMI-for-age cutoffs [5th, 85th, 95th]
            const bmiCutoffs = {
                Male: {
                    2: [14.7,18.2,19.3], 3: [14.3,17.4,18.3], 4: [14.0,16.9,17.8], 5: [13.8,16.8,17.9],
                    6: [13.7,17.0,18.4], 7: [13.7,17.4,19.2], 8: [13.8,17.9,20.0], 9: [14.0,18.6,21.0],
                    10:[14.2,19.4,22.1], 11:[14.5,20.2,23.2], 12:[14.9,21.1,24.2], 13:[15.3,21.9,25.1],
                    14:[15.8,22.7,26.0], 15:[16.3,23.5,26.8], 16:[16.8,24.2,27.5], 17:[17.3,24.9,28.2], 18:[17.8,25.6,28.9]
                },
                Female: {
                    2: [14.4,18.0,19.1], 3: [14.0,17.2,18.3], 4: [13.7,16.8,18.0], 5: [13.5,16.8,18.2],
                    6: [13.4,17.1,18.8], 7: [13.4,17.6,19.6], 8: [13.5,18.3,20.6], 9: [13.7,19.1,21.7],
                    10:[14.0,20.0,22.9], 11:[14.3,20.9,24.1], 12:[14.7,21.8,25.3], 13:[15.2,22.7,26.3],
                    14:[15.7,23.5,27.3], 15:[16.2,24.2,28.1], 16:[16.6,24.8,28.9], 17:[17.0,25.3,29.5], 18:[17.3,25.7,30.0]
                }
            };

            const getBmiStatus = (bmi, ageYrs, sex) => {
                let cutoffs = [18.5, 25.0, 30.0]; // Default adult
                if (ageYrs >= 2 && ageYrs <= 18) {
                    const table = bmiCutoffs[sex];
                    if (table && table[ageYrs]) cutoffs = table[ageYrs];
                }
                
                let label, color, bg;
                if (bmi < cutoffs[0]) { label = 'Underweight'; color = '#3b82f6'; bg = '#eff6ff'; }
                else if (bmi < cutoffs[1]) { label = 'Healthy Weight'; color = '#16a34a'; bg = '#f0fdf4'; }
                else if (bmi < cutoffs[2]) { label = 'Overweight'; color = '#d97706'; bg = '#fffbeb'; }
                else { label = 'Obese'; color = '#dc2626'; bg = '#fef2f2'; }
                
                return { label, color, bg, cutoffs };
            };

            const calc = () => {
                const h = parseFloat(hi.value), w = parseFloat(wi.value);
                const wrapper = formEl.querySelector('.bmi-gauge-wrapper');
                const needle = formEl.querySelector('.bmi-needle');
                
                if (h > 0 && w > 0) {
                    const bmi = w / Math.pow(h / 100, 2);
                    
                    // Calculate age in years for percentiles
                    let ageYrs = 20; // default adult
                    if (dobInput && dobInput.value) {
                        const b = new Date(dobInput.value);
                        if (!isNaN(b)) {
                            ageYrs = new Date().getFullYear() - b.getFullYear();
                        }
                    }
                    
                    const sex = (sexSel && sexSel.value) ? sexSel.value : 'Male'; // Fallback to male percentiles if missing
                    const status = getBmiStatus(bmi, ageYrs, sex);
                    
                    bi.value = bmi.toFixed(1) + ' - ' + status.label;
                    bi.style.backgroundColor = status.bg;
                    bi.style.color = status.color;
                    bi.style.fontWeight = '600';
                    bi.style.borderColor = status.color;
                    
                    // Update Gauge Needle
                    if (wrapper && needle) {
                        wrapper.classList.add('show');
                        const c = status.cutoffs;
                        let angle = 0; // 0 to 180
                        if (bmi < c[0]) {
                            angle = (bmi / c[0]) * 36;
                        } else if (bmi < c[1]) {
                            angle = 36 + ((bmi - c[0]) / (c[1] - c[0])) * 72;
                        } else if (bmi < c[2]) {
                            angle = 108 + ((bmi - c[1]) / (c[2] - c[1])) * 36;
                        } else {
                            angle = 144 + Math.min((bmi - c[2]) / 10, 1) * 36;
                        }
                        // needle is naturally vertical (pointing to 90deg in a 0-180 scale). 
                        // So subtract 90 to make 0 map to -90 (left) and 180 map to +90 (right).
                        needle.style.transform = `rotate(${angle - 90}deg)`;
                    }
                } else {
                    bi.value = '';
                    bi.style.backgroundColor = '#e8e8e8';
                    bi.style.color = '';
                    bi.style.fontWeight = '';
                    bi.style.borderColor = '';
                    if (wrapper) wrapper.classList.remove('show');
                }
            };
            
            hi.addEventListener('input', calc);
            wi.addEventListener('input', calc);
            if (sexSel) sexSel.addEventListener('change', calc);
            if (dobInput) dobInput.addEventListener('change', calc);
            
            bi.setAttribute('readonly', true);
            if (!bi.value) bi.style.backgroundColor = '#e8e8e8';

            // Run calculation immediately in case fields are pre-populated
            calc();
        }
    };

    const devForm = document.getElementById('form-development');
    window.setupBmiAutoCalc(devForm);

    // ── Age Auto-calculate from DOB (Fixed against admission / assessment reference date) ──
    function calcAgeYearsFromDob(dobValue, refDateValue) {
        if (!dobValue) return null;
        const parts = String(dobValue).split('T')[0].split('-');
        let birth;
        if (parts.length === 3 && parts[0].length === 4) {
            birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            birth = new Date(dobValue);
        }
        if (isNaN(birth.getTime())) return null;
        let ref = new Date();
        if (refDateValue) {
            const parsed = new Date(refDateValue);
            if (!isNaN(parsed.getTime())) ref = parsed;
        }
        let years = ref.getFullYear() - birth.getFullYear();
        const months = ref.getMonth() - birth.getMonth();
        if (months < 0 || (months === 0 && ref.getDate() < birth.getDate())) {
            years--;
        }
        return Math.max(0, years);
    }

    function parseAgeStringToYears(ageStr) {
        if (!ageStr) return null;
        const str = String(ageStr).trim().toLowerCase();
        // If string only has months (e.g. "9 months", "less than 1 month"), they are under 1 year old (0 years)
        if (str.includes('month') && !str.includes('yr') && !str.includes('year')) {
            return 0;
        }
        const match = str.match(/(\d+)\s*(yr|year)?/);
        if (match) {
            return parseInt(match[1], 10) || 0;
        }
        const val = parseInt(str, 10);
        return isNaN(val) ? null : val;
    }

    // Returns completed age in years: increments dynamically with real calendar time
    function extractChildAge(childOrRow) {
        if (!childOrRow) return 0;

        // 1. Calculate live incrementing age from Date of Birth
        const dob = childOrRow.dob || childOrRow.child_dob;
        if (dob) {
            const liveYears = calcAgeYearsFromDob(dob);
            if (liveYears !== null) return liveYears;
        }

        // 2. Try _consultationData / _rapidData
        const rd = childOrRow._consultationData || childOrRow._rapidData || 
                  (childOrRow.rapid_data ? (typeof childOrRow.rapid_data === 'string' ? JSON.parse(childOrRow.rapid_data) : childOrRow.rapid_data) : null);
        if (rd && rd.dob) {
            const liveYearsRd = calcAgeYearsFromDob(rd.dob);
            if (liveYearsRd !== null) return liveYearsRd;
        }

        // 3. Fallback to reference age at admission if DOB missing
        const directAge = childOrRow.age || childOrRow.child_age || (rd && rd.age);
        if (directAge) {
            const p = parseAgeStringToYears(directAge);
            if (p !== null) return p;
        }

        if (Array.isArray(childOrRow.assessments)) {
            const cf = childOrRow.assessments.find(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
            if (cf && cf.data) {
                if (cf.data.dob) {
                    const y = calcAgeYearsFromDob(cf.data.dob);
                    if (y !== null) return y;
                }
                if (cf.data.age) {
                    const p = parseAgeStringToYears(cf.data.age);
                    if (p !== null) return p;
                }
            }
        }

        return 0;
    }

    // Returns live incremented age, accompanied by the permanent admission age for reference
    function extractChildAgeString(childOrRow) {
        if (!childOrRow) return '—';
        const dob = childOrRow.dob || childOrRow.child_dob;
        const liveStr = dob ? calcAge(dob) : null;

        const refAge = (childOrRow.age_at_creation && childOrRow.age_at_creation !== 'null') ? String(childOrRow.age_at_creation).trim() :
                      (childOrRow.child_age_at_creation && childOrRow.child_age_at_creation !== 'null') ? String(childOrRow.child_age_at_creation).trim() :
                      (childOrRow.age && childOrRow.age !== 'null') ? String(childOrRow.age).trim() :
                      (childOrRow.child_age && childOrRow.child_age !== 'null') ? String(childOrRow.child_age).trim() :
                      (childOrRow._consultationData && (childOrRow._consultationData.age_at_creation || childOrRow._consultationData.age)) ? String(childOrRow._consultationData.age_at_creation || childOrRow._consultationData.age).trim() :
                      (childOrRow._rapidData && (childOrRow._rapidData.age_at_creation || childOrRow._rapidData.age)) ? String(childOrRow._rapidData.age_at_creation || childOrRow._rapidData.age).trim() : null;

        if (liveStr && refAge && refAge !== liveStr) {
            return `${liveStr} (Adm: ${refAge})`;
        }
        return liveStr || refAge || '—';
    }

    function isAutismChild(childOrRow) {
        if (!childOrRow) return false;
        if (childOrRow.is_autism === true || childOrRow.is_autism === 'true' || childOrRow.is_autism === 1) return true;
        if (childOrRow.child_is_autism === true || childOrRow.child_is_autism === 'true' || childOrRow.child_is_autism === 1) return true;
        if (childOrRow.diagnosis && /\b(autism|asd)\b/i.test(String(childOrRow.diagnosis))) return true;

        if (Array.isArray(childOrRow.assessments)) {
            for (const a of childOrRow.assessments) {
                const d = a.data;
                if (!d) continue;
                if (d.is_autism === true || d.is_autism === 'true' || d.category_type === 'autism') return true;
                if (d.diagnosis && /\b(autism|asd)\b/i.test(String(d.diagnosis))) return true;
                if (d.dev_diagnosis && /\b(autism|asd)\b/i.test(String(d.dev_diagnosis))) return true;
            }
        }
        const rd = childOrRow._consultationData || childOrRow._rapidData || childOrRow.rapid_data;
        if (rd) {
            try {
                const parsed = typeof rd === 'string' ? JSON.parse(rd) : rd;
                if (parsed) {
                    if (parsed.is_autism === true || parsed.is_autism === 'true' || parsed.category_type === 'autism') return true;
                    if (parsed.diagnosis && /\b(autism|asd)\b/i.test(String(parsed.diagnosis))) return true;
                    if (parsed.dev_diagnosis && /\b(autism|asd)\b/i.test(String(parsed.dev_diagnosis))) return true;
                }
            } catch (e) {}
        }
        return false;
    }

    function matchesAgeFilter(childOrRow, ageFilterVal = 'all') {
        const ageNum = extractChildAge(childOrRow);
        const isAutism = isAutismChild(childOrRow);

        // ASD / Autism login has NO age limit: all ages permitted
        if (userRole === 'autism' || userRole === 'asd') return isAutism;
        if (userRole === 'staff') return ageNum < 8;
        if (userRole === 'staff8') return ageNum >= 8;
        if (userRole === 'admin') {
            if (ageFilterVal === 'under8') return ageNum < 8;
            if (ageFilterVal === '8plus') return ageNum >= 8;
            if (ageFilterVal === 'autism') return isAutism;
        }
        return true;
    }

    function formatDisplayDate(dateStr) {
        if (!dateStr) return '-';
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length === 3 && parts[0].length === 4) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            return d.toLocaleDateString();
        }
        return new Date(dateStr).toLocaleDateString();
    }

    function getLocalTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function calcAge(dobValue, refDateValue) {
        if (!dobValue) return '';
        const parts = String(dobValue).split('T')[0].split('-');
        let birth;
        if (parts.length === 3 && parts[0].length === 4) {
            birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            birth = new Date(dobValue);
        }
        if (isNaN(birth.getTime())) return '';
        let ref = new Date();
        if (refDateValue) {
            const parsed = new Date(refDateValue);
            if (!isNaN(parsed.getTime())) ref = parsed;
        }
        let years  = ref.getFullYear() - birth.getFullYear();
        let months = ref.getMonth()    - birth.getMonth();
        if (ref.getDate() < birth.getDate()) months--;
        if (months < 0) { years--; months += 12; }
        if (years < 0) return '';
        if (years === 0 && months === 0) return 'Less than 1 month';
        if (years === 0) return months + ' month' + (months !== 1 ? 's' : '');
        if (months === 0) return years  + ' year'  + (years  !== 1 ? 's' : '');
        return years + ' yr' + (years !== 1 ? 's' : '') + ' ' + months + ' mo';
    }

    function wireAgeDob(dobId, ageId) {
        const dobEl = document.getElementById(dobId);
        const ageEl = document.getElementById(ageId);
        if (!dobEl || !ageEl) return;
        ageEl.setAttribute('readonly', true);
        ageEl.style.backgroundColor = '#f1f5f9';
        ageEl.style.cursor = 'not-allowed';
        ageEl.title = 'Permanent static age calculated at time of assessment/admission';
        const update = () => { 
            const formEl = dobEl.closest('form');
            const dateInp = formEl?.querySelector('input[name="assessment_date"]');
            // If already has a saved permanent age and an active child is selected, keep it static!
            if (!ageEl.value || !activeChild) {
                ageEl.value = calcAge(dobEl.value, dateInp?.value || null); 
            }
        };
        dobEl.addEventListener('change', update);
        dobEl.addEventListener('input',  update);
        // Only fill on load if age is currently empty! Never overwrite existing saved permanent age!
        if (dobEl.value && !ageEl.value) update();
    }

    // Consultation Form & Rapid Assessment
    wireAgeDob('consultation-dob', 'consultation-age-at-creation');
    wireAgeDob('consultation-dob', 'consultation-age');
    wireAgeDob('rapid-dob', 'rapid-age');

    // Child Development form
    const devFormElement = document.getElementById('form-development');
    const devDob = devFormElement?.querySelector('input[name="dob"]');
    const devAge = devFormElement?.querySelector('input[name="age"]');
    if (devDob && devAge) {
        devAge.setAttribute('readonly', true);
        devAge.style.backgroundColor = '#e8e8e8';
        devAge.style.cursor = 'not-allowed';
        devAge.title = 'Permanent age at time of assessment';
        const updateDevAge = () => { 
            const dateInp = devFormElement.querySelector('input[name="assessment_date"]');
            devAge.value = calcAge(devDob.value, dateInp?.value || null); 
        };
        devDob.addEventListener('change', updateDevAge);
        devDob.addEventListener('input',  updateDevAge);
        const devDateInp = devFormElement.querySelector('input[name="assessment_date"]');
        if (devDateInp) {
            devDateInp.addEventListener('change', updateDevAge);
            devDateInp.addEventListener('input',  updateDevAge);
        }
        if (devDob.value && !devAge.value) updateDevAge();
    }

    // ── Progress Goals ───────────────────────────────────────
    const addGoalBtn    = document.getElementById('add-goal-btn');
    const goalsContainer = document.getElementById('goals-container');

    if (addGoalBtn) {
        addGoalBtn.addEventListener('click', () => {
            const g = document.createElement('div');
            g.className = 'form-section goal-entry';
            g.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #f0f0f0;margin-bottom:24px;padding-bottom:12px;">' +
                    '<h3 style="border:none;margin:0;padding:0;">Goal Tracking</h3>' +
                    '<button type="button" class="btn-secondary remove-goal-btn" style="padding:4px 8px;">Remove</button>' +
                '</div>' +
                '<div class="form-grid">' +
                    '<div class="input-group full-width"><label>Long Term Goal</label><textarea name="long_term_goal[]" rows="2"></textarea></div>' +
                    '<div class="input-group full-width"><label>Short Term Goal</label><textarea name="short_term_goal[]" rows="2"></textarea></div>' +
                    '<div class="input-group full-width"><label>Achievement during this quarter</label><textarea name="achievement[]" rows="2"></textarea></div>' +
                    '<div class="input-group full-width"><label>Plan for next quarter</label><textarea name="next_plan[]" rows="2"></textarea></div>' +
                '</div>';
            goalsContainer.appendChild(g);
            g.querySelector('.remove-goal-btn').addEventListener('click', () => g.remove());
        });
    }

    // ── Form Submissions ─────────────────────────────────────
    const FORMS = [
        { id: 'form-consultation', type: 'Consultation Form',         isConsultation: true, isRapid: true  },
        { id: 'form-rapid',        type: 'Consultation Form',         isConsultation: true, isRapid: true  },
        { id: 'form-development',  type: 'Child Development',         isConsultation: false, isRapid: false },
        { id: 'form-physio',       type: 'Physiotherapy',             isConsultation: false, isRapid: false },
        { id: 'form-speech',       type: 'Speech Assessment',         isConsultation: false, isRapid: false },
        { id: 'form-progress',     type: 'Quarterly Progress Review', isConsultation: false, isRapid: false },
        { id: 'form-abc',          type: 'ABC Assessment',            isConsultation: false, isRapid: false },
        { id: 'form-isaa',         type: 'ISAA Assessment',           isConsultation: false, isRapid: false }
    ];

    FORMS.forEach(fi => {
        const el = document.getElementById(fi.id);
        if (!el) return;
        el.addEventListener('submit', async e => {
            e.preventDefault();
            const fd = new FormData(el);
            const data = {};
            for (let [k, v] of fd.entries()) {
                if (k.endsWith('[]')) {
                    const ck = k.slice(0, -2);
                    if (!data[ck]) data[ck] = [];
                    data[ck].push(v);
                } else if (data[k] !== undefined) {
                    if (!Array.isArray(data[k])) data[k] = [data[k]];
                    data[k].push(v);
                } else {
                    data[k] = v;
                }
            }
            if (fi.isConsultation || fi.isRapid) {
                await handleConsultation(data, el);
            } else {
                const name = activeChild ? activeChild.name : (data.child_name || '');
                if (!name) {
                    showToast('Please complete a Consultation Form first to create a child profile.', true);
                    return;
                }
                await saveAssessment(activeChild && activeChild.id, name, fi.type, data, el);
            }
        });
    });

    async function handleConsultation(data, el) {
        const name = data.child_name;
        if (!name) { showToast('Child name is required.', true); return; }
        const ageNum = extractChildAge({ dob: data.dob, _consultationData: data, _rapidData: data });
        const isAutism = (userRole === 'autism' || userRole === 'asd') || 
                         (document.getElementById('consultation-is-autism')?.checked === true) || 
                         (data.is_autism === true || data.is_autism === 'true');
        data.is_autism = isAutism;

        // Ensure permanent static age at creation is preserved and saved
        const staticAge = (data.age_at_creation && String(data.age_at_creation).trim()) ? String(data.age_at_creation).trim() :
                         (data.age && String(data.age).trim()) ? String(data.age).trim() :
                         (activeChild && (activeChild.age_at_creation || activeChild.age)) ||
                         (data.dob ? calcAge(data.dob, data.assessment_date || null) : null);
        data.age_at_creation = staticAge;
        data.age = staticAge;
        if (data.dob) {
            data.current_live_age = calcAge(data.dob);
        }

        if (userRole === 'staff8' && ageNum < 8) {
            showToast('Staff for older children can only enter details for children aged 8 or above.', true);
            return;
        }

        if (userRole === 'staff' && ageNum >= 8) {
            alert("More than 8 years");
            return;
        }

        // ASD login has NO age limit
        if ((userRole === 'autism' || userRole === 'asd') && !isAutism) {
            showToast('Please confirm child has Autism (ASD) to register under Autism unit.', true);
            return;
        }

        if (activeChild && activeChild.id) {
            // EDITING existing child profile and Consultation Form
            try {
                // 1. Update child profile
                const cr = await fetch('/api/children/' + activeChild.id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        name, 
                        admission_no: data.admission_no || activeChild.admission_no || null, 
                        dob: data.dob || null, 
                        age: staticAge,
                        age_at_creation: staticAge,
                        sex: data.sex || null, 
                        mobile: data.mobile || null,
                        is_autism: isAutism
                    })
                });
                if (!cr.ok) { showToast('Error updating child: ' + (await cr.json()).error, true); return; }
                const updatedChild = await cr.json();

                // 2. Update or create Consultation Form linked to this child
                const assId = currentEditingAssessments['Consultation Form'] || currentEditingAssessments['Rapid Assessment'];
                if (assId) {
                    const ar = await fetch('/api/assessments/' + assId, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data })
                    });
                    if (!ar.ok) { showToast('Error updating assessment: ' + (await ar.json()).error, true); return; }
                } else {
                    const ar = await fetch('/api/assessments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ child_id: activeChild.id, child_name: name, form_type: 'Consultation Form', data })
                    });
                    if (ar.ok) {
                        const newAss = await ar.json();
                        currentEditingAssessments['Consultation Form'] = newAss.id;
                    }
                }

                setActiveChild({ ...activeChild, ...updatedChild }, data);
                showToast('✅ Profile and Consultation Form updated successfully!');
                setTimeout(() => switchTab('child-development'), 1000);
                fetchChildFolders();
                return;
            } catch (err) {
                console.error(err);
                showToast('Failed to save assessment.', true);
                return;
            }
        }

        try {
            // 1. Create child profile
            const cr = await fetch('/api/children', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name, 
                    admission_no: data.admission_no || null, 
                    dob: data.dob || null, 
                    age: staticAge,
                    age_at_creation: staticAge,
                    sex: data.sex || null, 
                    mobile: data.mobile || null,
                    is_autism: isAutism
                })
            });
            if (!cr.ok) { showToast('Error creating child profile: ' + (await cr.json()).error, true); return; }
            const child = await cr.json();

            // 2. Save Consultation Form linked to child
            const ar = await fetch('/api/assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: child.id, child_name: name, form_type: 'Consultation Form', data })
            });
            if (ar.ok) {
                const createdAss = await ar.json();
                currentEditingAssessments['Consultation Form'] = createdAss.id;
                setActiveChild(child, data);
                el.reset();
                showToast('✅ Child profile created for "' + name + '"! Opening Child Development form...');
                setTimeout(() => switchTab('child-development'), 1200);
            } else {
                showToast('Error saving assessment: ' + (await ar.json()).error, true);
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to connect to server.', true);
        }
    }
    const handleRapid = handleConsultation;

    async function saveAssessment(childId, childName, formType, data, el) {
        const isAsd = (userRole === 'autism' || userRole === 'asd');
        if (isAsd && (formType !== 'ABC Assessment' && formType !== 'ISAA Assessment')) {
            showToast('Only ABC and ISAA assessments can be conducted in the ASD login.', true);
            return;
        }
        const isGeneralStaff = (userRole === 'staff' || userRole === 'staff8');
        if (isGeneralStaff && (formType === 'ABC Assessment' || formType === 'ISAA Assessment')) {
            showToast('Autism assessments can only be submitted from the ASD unit.', true);
            return;
        }

        if ((userRole === 'staff8' || userRole === 'staff' || isAsd) && activeChild) {
            const ageNum = extractChildAge(activeChild);
            
            if (userRole === 'staff8' && ageNum < 8) {
                showToast('Staff for older children can only enter details for children aged 8 or above.', true);
                return;
            }
            if (userRole === 'staff' && ageNum >= 8) {
                alert("More than 8 years");
                return;
            }
            // ASD login has NO age limit: all ages accepted for autism care
            if ((userRole === 'autism' || userRole === 'asd') && !isAutismChild(activeChild)) {
                showToast('Autism staff can only manage children registered for Autism/ASD care.', true);
                return;
            }
        }

        const existingAssId = currentEditingAssessments[formType];
        if (existingAssId) {
            // EDITING existing assessment record (Prevents creating duplicate files)
            try {
                const r = await fetch('/api/assessments/' + existingAssId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data })
                });
                if (r.ok) {
                    showToast(`✅ ${formType} updated successfully!`);
                    if (activeChild && activeChild.assessments) {
                        const idx = activeChild.assessments.findIndex(a => a.id == existingAssId);
                        if (idx !== -1) activeChild.assessments[idx].data = data;
                    }
                    fetchChildFolders();
                } else {
                    showToast('Error: ' + (await r.json()).error, true);
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to update assessment.', true);
            }
            return;
        }

        try {
            const r = await fetch('/api/assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: childId, child_name: childName, form_type: formType, data })
            });
            if (r.ok) {
                const created = await r.json();
                currentEditingAssessments[formType] = created.id;
                showToast(formType + ' saved successfully!');
                const nf = el.querySelector('input[name="child_name"]');
                const sv = nf && nf.value;
                el.reset();
                if (nf && sv) nf.value = sv;
                prefillFromActive();
                refreshActiveChildAssessments();
                fetchChildFolders();
            } else {
                showToast('Error: ' + (await r.json()).error, true);
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to connect to server.', true);
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    function showToast(msg, isError) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.className = 'toast ' + (isError ? 'error' : '') + ' show';
        setTimeout(() => t.classList.remove('show'), 3500);
    }

    // ── Assessment Panel (New Assessment overlay) ────────────
    const assessmentPanel  = document.getElementById('assessment-panel');
    const btnNewAssessment = document.getElementById('btn-new-assessment');
    const btnApBack        = document.getElementById('btn-ap-back');
    const btnApClose       = document.getElementById('btn-ap-close');
    const apTypePicker     = document.getElementById('ap-type-picker');
    const apFormContainer  = document.getElementById('ap-form-container');
    const apTitle          = document.getElementById('ap-title');

    function openAssessmentPanel() {
        if (assessmentPanel) {
            assessmentPanel.classList.remove('hidden');
            // Always show type picker first
            if (apTypePicker) apTypePicker.style.display = '';
            if (apFormContainer) { apFormContainer.classList.add('hidden'); apFormContainer.innerHTML = ''; }
            if (apTitle) apTitle.textContent = 'New Assessment';
            filterAssessmentCardsForRole();
        }
    }

    function closeAssessmentPanel() {
        if (assessmentPanel) assessmentPanel.classList.add('hidden');
    }

    btnNewAssessment && btnNewAssessment.addEventListener('click', openAssessmentPanel);
    btnApClose       && btnApClose.addEventListener('click', closeAssessmentPanel);
    btnApBack        && btnApBack.addEventListener('click', () => {
        // If form is shown, go back to type picker
        if (apFormContainer && !apFormContainer.classList.contains('hidden')) {
            apFormContainer.classList.add('hidden');
            apFormContainer.innerHTML = '';
            if (apTypePicker) apTypePicker.style.display = '';
            if (apTitle) apTitle.textContent = 'New Assessment';
        } else {
            closeAssessmentPanel();
        }
    });

    // Type-picker card clicks → close panel and navigate to the selected form
    document.querySelectorAll('.ap-type-card').forEach(card => {
        card.addEventListener('click', () => {
            const formId = card.getAttribute('data-form-id');
            closeAssessmentPanel();
            switchTab(formId);
            prefillFromActive(); // re-run fill in case form just became visible
            const target = document.getElementById(formId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // ── Child Folder Records ─────────────────────────────────
    const searchBtn     = document.getElementById('search-btn');
    const searchInput   = document.getElementById('search-input');
    const foldersEl     = document.getElementById('children-folders');

    searchBtn   && searchBtn.addEventListener('click',  () => fetchChildFolders(searchInput.value));
    searchInput && searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') fetchChildFolders(searchInput.value); });
    
    const recordsAgeFilter = document.getElementById('records-age-filter');
    recordsAgeFilter && recordsAgeFilter.addEventListener('change', () => fetchChildFolders(searchInput.value));

    const recordsTherapyFilter = document.getElementById('records-therapy-filter');
    recordsTherapyFilter && recordsTherapyFilter.addEventListener('change', () => fetchChildFolders(searchInput.value));

    const ICONS = {
        'Rapid Assessment':         '\u26a1',
        'Child Development':        '\ud83d\udc76',
        'Physiotherapy':            '\ud83d\udcaa',
        'Speech Assessment':        '\ud83d\udde3\ufe0f',
        'Quarterly Progress Review':'\ud83d\udcc8',
        'ABC Assessment':           '\ud83e\udde9',
        'ISAA Assessment':          '\ud83d\udcca'
    };

    async function fetchChildFolders(q) {
        q = q || '';
        try {
            let url = '/api/children';
            const params = [];
            if (q) params.push('search=' + encodeURIComponent(q));
            if (userRole === 'autism' || userRole === 'asd') params.push('autism=true');
            if (params.length) url += '?' + params.join('&');
            const res = await fetch(url);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.error || 'Failed to load children', true);
                return;
            }
            const children = await res.json();
            if (!Array.isArray(children)) {
                showToast('Unexpected server response for child list', true);
                return;
            }
            foldersEl.innerHTML = '';
            
            const ageFilter = document.getElementById('records-age-filter')?.value || 'all';
            const therapyFilter = document.getElementById('records-therapy-filter')?.value || 'all';
            let filteredChildren = children;
            
            if (userRole === 'autism' || userRole === 'asd') {
                filteredChildren = children.filter(child => isAutismChild(child));
            } else if (userRole === 'staff' || userRole === 'staff8' || (userRole === 'admin' && ageFilter !== 'all')) {
                filteredChildren = children.filter(child => matchesAgeFilter(child, ageFilter));
            }

            if (therapyFilter !== 'all') {
                filteredChildren = filteredChildren.filter(child =>
                    child.assessments && child.assessments.some(a => a.form_type === therapyFilter)
                );
            }

            if (!filteredChildren.length) {
                const emptyMsg = (userRole === 'autism' || userRole === 'asd') 
                    ? 'No child profiles found for Autism (ASD) unit.' 
                    : 'No child profiles found.';
                foldersEl.innerHTML = '<div class="empty-folders"><span style="font-size:3rem">📂</span><p>' + emptyMsg + '</p></div>';
                return;
            }

            filteredChildren.forEach(child => {
                const isActive = activeChild && activeChild.id === child.id;
                const rows = child.assessments.length
                    ? child.assessments.map(a =>
                        '<div class="folder-assessment-row">' +
                            '<span class="folder-assessment-icon">' + (ICONS[a.form_type] || '\ud83d\udcc4') + '</span>' +
                            '<span class="folder-assessment-type">' + a.form_type + '</span>' +
                            '<span class="folder-assessment-date">' + new Date(a.created_at).toLocaleDateString() + '</span>' +
                            '<div class="row-btns">' +
                                '<button class="btn-view-sm"   data-id="' + a.id + '">View</button>' +
                                '<button class="btn-edit-sm"   data-id="' + a.id + '">&#9998; Edit</button>' +
                                '<button class="btn-delete-sm" data-id="' + a.id + '">&#128465; Delete</button>' +
                            '</div>' +
                        '</div>').join('')
                    : '<div class="folder-empty-msg">No assessments saved yet.</div>';

                const isAutism = isAutismChild(child);
                const asdBadge = isAutism
                    ? '<span class="asd-badge" style="display:inline-flex; align-items:center; gap:3px; font-size:0.75rem; background:#ede9fe; color:#6d28d9; border:1px solid #c4b5fd; border-radius:12px; padding:1px 8px; margin-left:6px; font-weight:700;">🧩 ASD</span>'
                    : '';
                const isTH = child.admission_no && child.admission_no.toUpperCase().startsWith('TH');
                const admPrefixLabel = isTH ? 'TH No: ' : 'EIC No: ';

                const childJson    = JSON.stringify({
                    id: child.id, 
                    name: child.name, 
                    admission_no: child.admission_no || '', 
                    dob: child.dob, 
                    age: child.age || '',
                    sex: child.sex, 
                    mobile: child.mobile,
                    is_autism: isAutism,
                    assessments: child.assessments || []
                });
                const safeChildJson = childJson.replace(/"/g, '&quot;');
                const openBtn = isActive
                    ? '<span class="active-badge">\u25cf Active</span>'
                    : '<button class="btn-open-folder" data-child-json="' + safeChildJson + '">Open</button>';

                // Assessment form shortcut buttons shown inside the folder:
                // THE ABC, ISAA assessment forms are available ONLY for ASD children!
                let baseBtns = [];
                const isChildAutism = isAutismChild(child);
                if (isChildAutism) {
                    // ASD Child: ONLY ABC & ISAA assessment forms are available
                    baseBtns = [
                        { id:'abc-assessment',  icon:'\ud83e\udde9', label:'ABC (Tamil)'  },
                        { id:'isaa-assessment', icon:'\ud83d\udcca', label:'ISAA (Tamil)' }
                    ];
                } else {
                    // Non-ASD Child: ONLY general assessment forms (ABC & ISAA are hidden)
                    baseBtns = [
                        { id:'child-development', icon:'\ud83d\udc76', label:'Child Dev.' },
                        { id:'physiotherapy',     icon:'\ud83d\udcaa', label:'Physio'     },
                        { id:'speech',            icon:'\ud83d\udde3\ufe0f', label:'Speech' },
                        { id:'progress-review',   icon:'\ud83d\udcc8', label:'Progress'   }
                    ];
                }
                const formBtns = baseBtns.map(f =>
                    '<button class="btn-form-link' + (f.id.includes('abc') || f.id.includes('isaa') ? ' btn-autism-form' : '') + '" data-form-id="' + f.id + '" data-child-json="' + safeChildJson + '">' +
                        f.icon + '\u00a0' + f.label +
                    '</button>'
                ).join('');

                const card = document.createElement('div');
                card.className = 'child-folder-card' + (isActive ? ' folder-active' : '');
                const ageDisplay = extractChildAgeString(child);
                const meta = [
                    child.admission_no ? admPrefixLabel + child.admission_no : '', 
                    child.sex, 
                    child.dob ? 'DOB: ' + child.dob : '', 
                    (ageDisplay && ageDisplay !== '—') ? 'Age: ' + ageDisplay : '',
                    child.mobile ? '📱 ' + child.mobile : '', 
                    child.assessments.length + ' assessment(s)'
                ].filter(Boolean).join(' · ');
                const badgeBg = isTH ? '#c2410c' : '#1e40af';
                const admBadge = child.admission_no 
                    ? '<span class="adm-badge" style="display:inline-block; font-size:0.8rem; background:' + badgeBg + '; color:#ffffff; border-radius:4px; padding:2px 8px; margin-right:8px; font-weight:700; letter-spacing:0.02em;">' + child.admission_no + '</span>'
                    : '';
                card.innerHTML =
                    '<div class="folder-header" data-child-id="' + child.id + '">' +
                        '<div class="folder-title">' +
                            '<span class="folder-icon">' + (isActive ? '\ud83d\udcc2' : '\ud83d\udcc1') + '</span>' +
                            '<div>' +
                                '<strong class="folder-child-name">' + admBadge + child.name + asdBadge + '</strong>' +
                                '<small class="folder-meta">' + meta + '</small>' +
                            '</div>' +
                        '</div>' +
                        '<div class="folder-actions">' + openBtn + '<button class="btn-edit-child-profile btn-secondary btn-sm" data-child-json="' + safeChildJson + '" style="font-weight:600; padding:3px 8px; font-size:0.75rem;" title="Edit Child Profile">✏️ Edit</button><button class="btn-folder-summary btn-secondary btn-sm" data-child-json="' + safeChildJson + '" style="background:#f0fdf4; color:#166534; border-color:#bbf7d0; font-weight:600; padding:3px 8px; font-size:0.75rem;" title="View Clinical Assessment Summary">📋 Summary</button><button class="btn-delete-folder" data-id="' + child.id + '" data-name="' + child.name.replace(/"/g, '&quot;') + '" title="Delete Folder">&#128465;</button><span class="folder-toggle">\u25be</span></div>' +
                    '</div>' +
                    '<div class="folder-body">' +
                        rows +
                        '<div class="folder-form-links" style="margin-top: 15px;">' +
                            '<span class="folder-form-links-label">Add Assessment:</span> ' +
                            formBtns +
                        '</div>' +
                        '<div class="folder-form-links" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">' +
                            '<span class="folder-form-links-label">Actions:</span> ' +
                            '<button class="btn-edit-child-profile btn-secondary btn-sm" data-child-json="' + safeChildJson + '" style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 600;">✏️ Edit Profile</button>' +
                            '<button class="btn-child-summary btn-secondary btn-sm" data-child-json="' + safeChildJson + '" style="background: #f0fdf4; color: #166534; border-color: #86efac; font-weight: 600;">📋 Assessment Summary</button>' +
                            '<button class="btn-log-therapy btn-blue btn-sm" data-child-json="' + safeChildJson + '">⏱️ Log Therapy</button>' +
                            '<button class="btn-view-attendance btn-secondary btn-sm" data-child-id="' + child.id + '">📊 View History</button>' +
                            '<button class="btn-view-progress btn-secondary btn-sm" data-child-json="' + safeChildJson + '" style="background: #e0f2fe; color: #0369a1; border-color: #bae6fd; font-weight: 600;">📈 Growth & Progress</button>' +
                        '</div>' +
                    '</div>';

                foldersEl.appendChild(card);
            });

            // Events
            foldersEl.querySelectorAll('.folder-header').forEach(h => {
                h.addEventListener('click', e => {
                    if (e.target.classList.contains('btn-open-folder') ||
                        e.target.classList.contains('btn-edit-child-profile') ||
                        e.target.classList.contains('btn-folder-summary')||
                        e.target.classList.contains('btn-child-summary') ||
                        e.target.classList.contains('btn-view-sm')      ||
                        e.target.classList.contains('btn-edit-sm')      ||
                        e.target.classList.contains('btn-delete-sm')    ||
                        e.target.classList.contains('btn-delete-folder')||
                        e.target.closest('.btn-delete-folder')          ||
                        e.target.classList.contains('btn-form-link')    ||
                        e.target.classList.contains('btn-log-therapy')  ||
                        e.target.classList.contains('btn-view-attendance') ||
                        e.target.classList.contains('btn-view-progress')) return;
                    const c = h.closest('.child-folder-card');
                    c.classList.toggle('folder-open');
                    h.querySelector('.folder-toggle').textContent = c.classList.contains('folder-open') ? '\u25b4' : '\u25be';
                });
            });

            foldersEl.querySelectorAll('.btn-edit-child-profile').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    openChildEditModal(cd);
                });
            });

            foldersEl.querySelectorAll('.btn-open-folder').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    setActiveChild(cd);
                    showToast('"' + cd.name + '" is now the active profile.');
                    fetchChildFolders(searchInput ? searchInput.value : '');
                });
            });

            // Child Assessment Summary buttons (header & actions row)
            foldersEl.querySelectorAll('.btn-folder-summary, .btn-child-summary').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    openChildSummaryModal(cd);
                });
            });

            foldersEl.querySelectorAll('.btn-view-sm').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); viewRecord(btn.getAttribute('data-id')); });
            });

            foldersEl.querySelectorAll('.btn-edit-sm').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); editRecord(btn.getAttribute('data-id')); });
            });

            foldersEl.querySelectorAll('.btn-delete-sm').forEach(btn => {
                btn.addEventListener('click', e => { e.stopPropagation(); deleteRecord(btn.getAttribute('data-id')); });
            });

            // Delete Child Folder
            foldersEl.querySelectorAll('.btn-delete-folder').forEach(btn => {
                btn.addEventListener('click', async e => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    const name = btn.getAttribute('data-name');
                    if (confirm('Delete child profile for "' + name + '"? This will delete the child and ALL their assessments permanently.')) {
                        try {
                            const resp = await fetch('/api/children/' + id, { method: 'DELETE' });
                            if (resp.ok) {
                                showToast('Child profile "' + name + '" deleted.');
                                if (activeChild && activeChild.id == id) setActiveChild(null);
                                fetchChildFolders(searchInput ? searchInput.value : '');
                            } else {
                                showToast('Error: ' + (await resp.json()).error, true);
                            }
                        } catch (err) { showToast('Failed to delete profile.', true); }
                    }
                });
            });

            // Assessment form links inside each folder
            foldersEl.querySelectorAll('.btn-form-link').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const formId = btn.getAttribute('data-form-id');
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    // Activate child if different from current
                    if (!activeChild || activeChild.id !== cd.id) {
                        setActiveChild(cd);
                    }
                    switchTab(formId);
                    prefillFromActive();
                    const target = document.getElementById(formId);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            });

            // Log Therapy button
            foldersEl.querySelectorAll('.btn-log-therapy').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    openLogTherapyModal(cd);
                });
            });

            // View Attendance History button
            foldersEl.querySelectorAll('.btn-view-attendance').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const childId = btn.getAttribute('data-child-id');
                    
                    // Switch to reports tab
                    switchTab('reports');
                    
                    // Wait briefly for the tab logic (like populateReportChildSelect) to run, then select the child
                    setTimeout(() => {
                        const targetTab = document.querySelector(`.child-tab[data-id="${childId}"]`);
                        if (targetTab) {
                            targetTab.click();
                        } else {
                            // Fallback if tabs aren't populated yet
                            const select = document.getElementById('report-child-select');
                            if (select) select.value = childId;
                            fetchReports();
                        }
                    }, 50);
                });
            });

            // Growth & Progress button
            foldersEl.querySelectorAll('.btn-view-progress').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    openProgressModal(cd);
                });
            });

            // Auto-open active folder
            if (activeChild) {
                foldersEl.querySelectorAll('.folder-header').forEach(h => {
                    if (parseInt(h.getAttribute('data-child-id')) === activeChild.id) {
                        const c = h.closest('.child-folder-card');
                        c.classList.add('folder-open');
                        h.querySelector('.folder-toggle').textContent = '\u25b4';
                    }
                });
            }
        } catch (err) { console.error('Folder fetch error', err); }
    }

    // ── Modal ─────────────────────────────────────────────────
    const modal      = document.getElementById('record-modal');
    const closeBtn   = document.querySelector('.close-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody  = document.getElementById('modal-body');

    const modalContent = modal.querySelector('.modal-content');

    function closeModal() {
        modal.classList.remove('show');
        modalContent.classList.remove('modal-form-view');
    }
    closeBtn && closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Download Assessment PDF button
    document.getElementById('btn-download-pdf')?.addEventListener('click', () => {
        if (!currentViewingRecord) {
            showToast('No record loaded to download', true);
            return;
        }
        generateAssessmentPdf(currentViewingRecord);
    });

    let currentViewingChild = null;

    // Connect Assessment Viewer Back button
    document.getElementById('btn-av-back')?.addEventListener('click', () => switchTab('records'));

    async function viewRecord(id) {
        try {
            const r = await fetch('/api/assessments/' + id);
            if (!r.ok) { showToast('Failed to fetch record', true); return; }
            const rec  = await r.json();
            currentViewingRecord = rec;
            const data = rec.data || {};

            let child = activeChild;
            if (rec.child_id && (!child || child.id !== rec.child_id)) {
                try {
                    const cr = await fetch('/api/children/' + rec.child_id);
                    if (cr.ok) {
                        child = await cr.json();
                        setActiveChild(child);
                    }
                } catch (e) {}
            }
            currentViewingChild = child;

            // Ensure essential patient demographic info and dates are never blank
            if (!data.assessment_date) {
                data.assessment_date = data.date || data.review_date || (rec.created_at ? rec.created_at.split('T')[0] : '');
            }
            if (!data.dob && child && child.dob) {
                data.dob = child.dob;
            }
            if (!data.admission_no && child && child.admission_no) {
                data.admission_no = child.admission_no;
            }
            if (!data.sex && child && child.sex) {
                data.sex = child.sex;
            }
            if (!data.age_at_creation) {
                data.age_at_creation = rec.age_at_creation || (child && (child.age_at_creation || child.age)) || data.age || (data.dob ? calcAge(data.dob, data.assessment_date || null) : '');
            }
            if (!data.age) {
                data.age = data.age_at_creation;
            }
            if (!data.current_live_age && data.dob) {
                data.current_live_age = calcAge(data.dob);
            }

            const FORM_MAP = {
                'Consultation Form':         'form-consultation',
                'Rapid Assessment':          'form-consultation',
                'Child Development':         'form-development',
                'Physiotherapy':             'form-physio',
                'Speech Assessment':         'form-speech',
                'Quarterly Progress Review': 'form-progress',
                'ABC Assessment':            'form-abc',
                'ISAA Assessment':           'form-isaa',
            };

            const targetFormId = FORM_MAP[rec.form_type] || (rec.form_type === 'Consultation Form' || rec.form_type === 'Rapid Assessment' ? 'form-consultation' : null);
            const originalForm = document.getElementById(targetFormId) || 
                (targetFormId === 'form-consultation' ? document.getElementById('form-rapid') : null) ||
                (targetFormId === 'form-rapid' ? document.getElementById('form-consultation') : null);
            const mount = document.getElementById('av-form-mount');
            if (!originalForm || !mount) {
                showToast('Form template not found for ' + rec.form_type, true);
                return;
            }

            const clone = buildFormClone(originalForm, data, true /* readOnly */);
            mount.className = 'av-form-mount view-mode';
            mount.innerHTML = '';
            mount.appendChild(clone);

            // Auto-expand textareas in read-only mode so content is completely visible
            setTimeout(() => {
                clone.querySelectorAll('textarea').forEach(ta => {
                    ta.style.height = 'auto';
                    ta.style.height = Math.max(ta.scrollHeight + 8, 54) + 'px';
                });
            }, 60);

            // Header Title & Demographics
            const admBadge = (child && child.admission_no) ? `<span class="adm-badge" style="display:inline-block; font-size:0.8rem; background:#1e40af; color:#ffffff; border-radius:4px; padding:2px 8px; margin-right:8px; font-weight:700;">${child.admission_no}</span>` : '';
            const avTitle = document.getElementById('av-title');
            const avSubtitle = document.getElementById('av-subtitle');
            if (avTitle) avTitle.innerHTML = `${admBadge}${rec.form_type} — <span>${rec.child_name}</span>`;
            
            const dateStr = rec.created_at ? new Date(rec.created_at).toLocaleString() : '';
            if (avSubtitle) avSubtitle.textContent = `Completed Assessment Dossier · Recorded on ${dateStr}`;

            // Notice Bar
            const noticeBar = document.getElementById('av-notice-bar');
            if (noticeBar) {
                noticeBar.className = 'av-notice-bar';
                noticeBar.innerHTML = `
                    <span>📋 <strong>View Mode (Read-Only):</strong> Displaying saved assessment record for ${rec.child_name}.</span>
                    <span style="font-size:0.82rem; color:#475569;">Recorded: ${dateStr}</span>
                `;
            }

            // Actions Bar (Top)
            const actionsBar = document.getElementById('av-actions-bar');
            if (actionsBar) {
                actionsBar.innerHTML = `
                    <button type="button" class="btn-primary btn-sm btn-av-edit" style="display:flex; align-items:center; gap:6px;">✏️ Edit Assessment</button>
                    <button type="button" class="btn-secondary btn-sm btn-av-pdf" style="display:flex; align-items:center; gap:6px; background:#fff;">📄 Download PDF</button>
                    <button type="button" class="btn-secondary btn-sm btn-av-delete" style="display:flex; align-items:center; gap:6px; color:var(--danger); border-color:#fca5a5;">🗑️ Delete</button>
                `;
                actionsBar.querySelector('.btn-av-edit')?.addEventListener('click', () => editRecord(id));
                actionsBar.querySelector('.btn-av-pdf')?.addEventListener('click', () => generateAssessmentPdf(rec));
                actionsBar.querySelector('.btn-av-delete')?.addEventListener('click', () => deleteRecord(id));
            }

            // Bottom Actions Bar
            const bottomBar = document.getElementById('av-bottom-bar');
            if (bottomBar) {
                bottomBar.innerHTML = `
                    <button type="button" class="btn-secondary btn-av-back-bottom">← Back to Records</button>
                    <div style="display:flex; gap:8px;">
                        <button type="button" class="btn-primary btn-av-edit" style="display:flex; align-items:center; gap:6px;">✏️ Edit Assessment</button>
                        <button type="button" class="btn-secondary btn-av-pdf" style="display:flex; align-items:center; gap:6px; background:#fff;">📄 Download PDF</button>
                    </div>
                `;
                bottomBar.querySelector('.btn-av-back-bottom')?.addEventListener('click', () => switchTab('records'));
                bottomBar.querySelector('.btn-av-edit')?.addEventListener('click', () => editRecord(id));
                bottomBar.querySelector('.btn-av-pdf')?.addEventListener('click', () => generateAssessmentPdf(rec));
            }

            // Hide old modal if open
            if (modal) modal.classList.remove('show');

            // Switch to the assessment-viewer tab
            switchTab('assessment-viewer');
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            console.error('Error viewing assessment:', err);
            showToast('Failed to view assessment', true);
        }
    }

    // ── Shared: build a populated form clone ──────────────────
    function buildFormClone(originalForm, data, readOnly) {
        const clone = originalForm.cloneNode(true);

        // Photo (before ID removal)
        if (data.photo_base64) {
            const imgEl = clone.querySelector('#dev-photo-preview');
            if (imgEl) { imgEl.src = data.photo_base64; imgEl.style.display = 'block'; }
            const phEl = clone.querySelector('#photo-placeholder');
            if (phEl) phEl.style.display = 'none';
        }
        // Hide file inputs & upload label in read-only mode
        if (readOnly) {
            clone.querySelectorAll('label[for="dev-photo"], label[for$="-photo"]').forEach(el => el.style.display = 'none');
            clone.querySelectorAll('input[type="file"]').forEach(el => el.style.display = 'none');
        }

        // Remove IDs to avoid DOM conflicts but preserve original ID for subtotal lookups
        clone.querySelectorAll('[id]').forEach(el => {
            el.setAttribute('data-orig-id', el.id);
            el.removeAttribute('id');
        });

        // Populate fields
        clone.querySelectorAll('input, select, textarea').forEach(el => {
            const name = el.name;
            if (!name || el.type === 'file') return;
            const val = data[name];
            if (el.type === 'checkbox') {
                const arr = Array.isArray(val) ? val : (val ? [val] : []);
                el.checked = arr.includes(el.value);
            } else if (el.type === 'radio') {
                el.checked = (val === el.value);
                if (el.checked && el.name.startsWith('ms_') && String(el.value).startsWith('>')) {
                    const card = el.closest('.milestone-card');
                    const dBox = card?.querySelector('.ms-delayed-box');
                    if (dBox) dBox.style.display = 'flex';
                }
            } else {
                el.value = (val !== undefined && val !== null) ? (Array.isArray(val) ? val.join(', ') : String(val)) : '';
            }
            if (readOnly) {
                if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') {
                    el.setAttribute('disabled', 'true');
                } else {
                    el.setAttribute('readonly', 'true');
                }
            } else {
                el.removeAttribute('readonly');
                el.removeAttribute('disabled');
                el.style.backgroundColor = '';
                el.style.cursor = '';
            }
        });

        // Ensure any milestone delayed detail box with existing values is visible
        clone.querySelectorAll('input[name$="_detail"]').forEach(inp => {
            if (inp.value && inp.value.trim()) {
                const card = inp.closest('.milestone-card');
                const dBox = card?.querySelector('.ms-delayed-box');
                if (dBox) dBox.style.display = 'flex';
            }
        });

        // Show conditional-desc blocks that have data
        clone.querySelectorAll('.conditional-desc').forEach(desc => {
            const hasVal = Array.from(desc.querySelectorAll('input, select, textarea')).some(i => i.value && i.value.trim());
            if (hasVal) desc.style.display = 'block';
        });

        // Siblings Auto-Calculation
        calcTotalSiblings(clone);

        if (!readOnly) {
            clone.querySelectorAll('input[name="siblings_brothers"], input[name="siblings_sisters"]').forEach(inp => {
                inp.addEventListener('input', () => calcTotalSiblings(clone));
                inp.addEventListener('change', () => calcTotalSiblings(clone));
            });
            setupMilestoneInteractions(clone);
            clone.querySelectorAll('.yes-no-select').forEach(sel => {
                sel.addEventListener('change', e => {
                    const desc = e.target.parentElement.querySelector('.conditional-desc');
                    if (!desc) return;
                    const show = e.target.value === 'Yes' || e.target.value === 'Defective';
                    desc.style.display = show ? 'block' : 'none';
                    if (!show) desc.querySelectorAll('input, select').forEach(i => i.value = '');
                });
            });
        }

        // Remove submit buttons from clone (we use dedicated top & bottom toolbars)
        clone.querySelectorAll('.form-actions').forEach(el => el.remove());

        clone.style.display = 'block';
        
        // Attach BMI auto-calculation for cloned form
        if (window.setupBmiAutoCalc) {
            window.setupBmiAutoCalc(clone);
        }

        // Live calculation for Autism Assessment Forms (ABC & ISAA) in clone
        if (clone.querySelector('.abc-score-input, .abc-checkbox')) {
            calculateAbcScores(clone);
            if (!readOnly) {
                clone.querySelectorAll('.abc-score-input, .abc-checkbox').forEach(inp => {
                    inp.addEventListener('input', () => calculateAbcScores(clone));
                    inp.addEventListener('change', () => calculateAbcScores(clone));
                });
            }
        }
        if (clone.querySelector('.isaa-radio')) {
            calculateIsaaScores(clone);
            if (!readOnly) {
                clone.querySelectorAll('.isaa-radio').forEach(r => {
                    r.addEventListener('change', () => calculateIsaaScores(clone));
                });
            }
        }
        
        return clone;
    }

    // ── Edit record ────────────────────────────────────────────
    async function editRecord(id) {
        try {
            let rec = currentViewingRecord;
            if (!rec || rec.id != id) {
                const r = await fetch('/api/assessments/' + id);
                if (!r.ok) { showToast('Failed to fetch assessment record', true); return; }
                rec = await r.json();
                currentViewingRecord = rec;
            }
            const isAsdUser = (userRole === 'autism' || userRole === 'asd');
            if (isAsdUser && rec.form_type !== 'ABC Assessment' && rec.form_type !== 'ISAA Assessment') {
                showToast('ASD login cannot edit other department assessment records.', true);
                return;
            }
            const isGeneralStaffUser = (userRole === 'staff' || userRole === 'staff8');
            if (isGeneralStaffUser && (rec.form_type === 'ABC Assessment' || rec.form_type === 'ISAA Assessment')) {
                showToast('General staff cannot edit ASD assessment records.', true);
                return;
            }
            const data = rec.data || {};

            let child = activeChild;
            if (rec.child_id && (!child || child.id !== rec.child_id)) {
                try {
                    const cr = await fetch('/api/children/' + rec.child_id);
                    if (cr.ok) {
                        child = await cr.json();
                        setActiveChild(child);
                    }
                } catch (e) {}
            }
            currentViewingChild = child;

            const FORM_MAP = {
                'Consultation Form':         'form-consultation',
                'Rapid Assessment':          'form-consultation',
                'Child Development':         'form-development',
                'Physiotherapy':             'form-physio',
                'Speech Assessment':         'form-speech',
                'Quarterly Progress Review': 'form-progress',
                'ABC Assessment':            'form-abc',
                'ISAA Assessment':           'form-isaa',
            };

            const targetFormId = FORM_MAP[rec.form_type] || (rec.form_type === 'Consultation Form' || rec.form_type === 'Rapid Assessment' ? 'form-consultation' : null);
            const originalForm = document.getElementById(targetFormId) || 
                (targetFormId === 'form-consultation' ? document.getElementById('form-rapid') : null) ||
                (targetFormId === 'form-rapid' ? document.getElementById('form-consultation') : null);
            const mount = document.getElementById('av-form-mount');
            if (!originalForm || !mount) {
                showToast('Form template not found for ' + rec.form_type, true);
                return;
            }

            const clone = buildFormClone(originalForm, data, false /* editable */);
            mount.className = 'av-form-mount edit-mode';
            mount.innerHTML = '';
            mount.appendChild(clone);

            const admBadge = (child && child.admission_no) ? `<span class="adm-badge" style="display:inline-block; font-size:0.8rem; background:#1e40af; color:#ffffff; border-radius:4px; padding:2px 8px; margin-right:8px; font-weight:700;">${child.admission_no}</span>` : '';
            const avTitle = document.getElementById('av-title');
            const avSubtitle = document.getElementById('av-subtitle');
            if (avTitle) avTitle.innerHTML = `✏️ Edit: ${admBadge}${rec.form_type} — <span>${rec.child_name}</span>`;
            if (avSubtitle) avSubtitle.textContent = 'Modify assessment details, clinical notes or observations and click Save Changes.';

            // Notice Bar
            const noticeBar = document.getElementById('av-notice-bar');
            if (noticeBar) {
                noticeBar.className = 'av-notice-bar edit-mode';
                noticeBar.innerHTML = `
                    <span>⚠️ <strong>Edit Mode:</strong> You are modifying clinical records for ${rec.child_name}. Changes will update this assessment upon saving.</span>
                `;
            }

            async function saveChanges() {
                const fd = new FormData(clone);
                const newData = {};
                for (let [k, v] of fd.entries()) {
                    if (k.endsWith('[]')) {
                        const ck = k.slice(0, -2);
                        if (!newData[ck]) newData[ck] = [];
                        newData[ck].push(v);
                    } else if (newData[k] !== undefined) {
                        if (!Array.isArray(newData[k])) newData[k] = [newData[k]];
                        newData[k].push(v);
                    } else {
                        newData[k] = v;
                    }
                }
                if (data.photo_base64 && !newData.photo_base64) newData.photo_base64 = data.photo_base64;

                try {
                    const resp = await fetch('/api/assessments/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: newData })
                    });
                    if (resp.ok) {
                        showToast('✅ Assessment updated successfully!');
                        currentViewingRecord = null;
                        await viewRecord(id);
                        fetchChildFolders();
                    } else {
                        const err = await resp.json().catch(() => ({}));
                        showToast('Error: ' + (err.error || 'Failed to save changes'), true);
                    }
                } catch (err) {
                    showToast('Failed to save assessment.', true);
                }
            }

            // Actions Bar (Top)
            const actionsBar = document.getElementById('av-actions-bar');
            if (actionsBar) {
                actionsBar.innerHTML = `
                    <button type="button" class="btn-primary btn-sm btn-av-save" style="display:flex; align-items:center; gap:6px;">💾 Save Changes</button>
                    <button type="button" class="btn-secondary btn-sm btn-av-cancel" style="display:flex; align-items:center; gap:6px; background:#fff;">✕ Cancel</button>
                `;
                actionsBar.querySelector('.btn-av-save')?.addEventListener('click', saveChanges);
                actionsBar.querySelector('.btn-av-cancel')?.addEventListener('click', () => viewRecord(id));
            }

            // Bottom Actions Bar
            const bottomBar = document.getElementById('av-bottom-bar');
            if (bottomBar) {
                bottomBar.innerHTML = `
                    <button type="button" class="btn-secondary btn-av-cancel">✕ Cancel</button>
                    <button type="button" class="btn-primary btn-av-save" style="min-width:140px; display:flex; align-items:center; gap:6px;">💾 Save Changes</button>
                `;
                bottomBar.querySelector('.btn-av-cancel')?.addEventListener('click', () => viewRecord(id));
                bottomBar.querySelector('.btn-av-save')?.addEventListener('click', saveChanges);
            }

            // Form submit listener
            clone.addEventListener('submit', (e) => {
                e.preventDefault();
                saveChanges();
            });

            // Hide old modal if open
            if (modal) modal.classList.remove('show');

            // Switch to assessment-viewer tab
            switchTab('assessment-viewer');
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (err) {
            console.error('Error editing assessment:', err);
            showToast('Failed to open assessment editor', true);
        }
    }

    // ── Delete record ──────────────────────────────────────────
    async function deleteRecord(id) {
        if (!confirm('Delete this assessment? This cannot be undone.')) return;
        try {
            const resp = await fetch('/api/assessments/' + id, { method: 'DELETE' });
            if (resp.ok) {
                showToast('Assessment deleted.');
                if (modal) modal.classList.remove('show');
                switchTab('records');
                fetchChildFolders();
            } else {
                showToast('Error: ' + (await resp.json()).error, true);
            }
        } catch (err) { showToast('Failed to delete.', true); }
    }

    // ── Log Therapy Modal ──────────────────────────────────────────
    const logModal = document.getElementById('log-therapy-modal');
    const logForm = document.getElementById('log-therapy-form');
    if (logModal) {
        logModal.querySelector('.close-modal').addEventListener('click', () => {
            logModal.classList.remove('show');
        });
    }

    const THERAPY_DEFAULT_FEES = {
        "Assessment and Goal setting": 250,
        "Medical review": 300,
        "Physiotherapy": 250,
        "Occupational Therapy": 250,
        "Sensory integration Sessions": 100,
        "Speech Training Sessions": 150,
        "Hydro therapy Sessions": 100,
        "ADL Sessions": 100,
        "Outdoor Activity Sessions": 100,
        "Academic Sessions": 100,
        "Music Therapy": 100,
        "Reflex Therapy": 250,
        "Siddha Treatment": 0,
        "Home programme": 0,
        "Nursing care and counselling": 0,
        "Orthotic Review": 0,
        "Other services": 0
    };

    const DEFAULT_THERAPISTS = [
        "Dr. Alen Sam",
        "Dr. Belsi Felix",
        "Mr. Fredly",
        "Ms. Jeya Nadhini",
        "Ms. Anisha",
        "Dr. Vijayasanthi",
        "Mr. Justin Vens",
        "Mr. Natharajan",
        "Mr. Jenish",
        "Dr. Mohandoss",
        "Mr. Vimal",
        "Ms. Vidhya",
        "Ms. Lega"
    ];

    const typeSelect = document.getElementById('log-therapy-type');
    const orthoticGroup = document.getElementById('orthotic-group');
    const therapistSelect = document.getElementById('log-therapy-therapist');
    const feeInput = document.getElementById('log-therapy-fee');
    const concessionInput = document.getElementById('log-therapy-concession');
    const toBePaidInput = document.getElementById('log-therapy-to-be-paid');
    const paidInput = document.getElementById('log-therapy-paid');
    const balanceInput = document.getElementById('log-therapy-balance');

    function calculateFinancials() {
        const fee = parseFloat(feeInput.value) || 0;
        const concession = parseFloat(concessionInput.value) || 0;
        const to_be_paid = Math.max(0, fee - concession);
        toBePaidInput.value = to_be_paid;
        
        const paid = parseFloat(paidInput.value) || 0;
        balanceInput.value = to_be_paid - paid;
    }

    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            const val = typeSelect.value;
            if (val === 'Orthotic Review') {
                orthoticGroup.style.display = 'flex';
            } else {
                orthoticGroup.style.display = 'none';
                document.getElementById('log-therapy-sub-therapy').value = '';
            }

            // Fee is determined strictly by the individual therapy type, NOT the therapist:
            const feeMatch = dynamicTherapyFees.find(tf => tf.therapy_type === val);
            if (feeMatch && feeMatch.fee !== undefined) {
                feeInput.value = feeMatch.fee;
            } else if (THERAPY_DEFAULT_FEES[val] !== undefined) {
                feeInput.value = THERAPY_DEFAULT_FEES[val];
            } else {
                feeInput.value = 0;
            }

            // Note: A single therapist can do multiple therapies. The therapist is chosen independently
            // and does not change or dictate the therapy fee.

            calculateFinancials();
        });
    }

    [feeInput, concessionInput, paidInput].forEach(inp => {
        if (inp) inp.addEventListener('input', calculateFinancials);
    });

    // Expose globally for the folder buttons
    window.openLogTherapyModal = function(child) {
        document.getElementById('log-therapy-child-id').value = child.id;
        document.getElementById('log-therapy-child-name').value = (child.admission_no ? `[${child.admission_no}] ` : '') + (child.name || '');
        document.getElementById('log-therapy-date').value = getLocalTodayDateString();
        typeSelect.value = '';
        document.getElementById('log-therapy-sub-therapy').value = '';
        orthoticGroup.style.display = 'none';
        therapistSelect.value = '';
        feeInput.value = 0;
        concessionInput.value = 0;
        toBePaidInput.value = 0;
        paidInput.value = 0;
        balanceInput.value = 0;
        document.getElementById('log-therapy-status').value = 'Present';
        document.getElementById('log-therapy-time-slot').value = '';
        document.getElementById('log-therapy-payment-mode').value = '';
        document.getElementById('log-therapy-notes').value = '';
        logModal.classList.add('show');
    };

    if (logForm) {
        logForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                child_id: document.getElementById('log-therapy-child-id').value,
                date: document.getElementById('log-therapy-date').value,
                therapy_type: typeSelect.value,
                time_slot: document.getElementById('log-therapy-time-slot').value,
                therapist_name: therapistSelect.value,
                sub_therapy: document.getElementById('log-therapy-sub-therapy').value,
                fee: parseFloat(feeInput.value) || 0,
                concession: parseFloat(concessionInput.value) || 0,
                to_be_paid: parseFloat(toBePaidInput.value) || 0,
                paid: parseFloat(paidInput.value) || 0,
                balance: parseFloat(balanceInput.value) || 0,
                payment_mode: document.getElementById('log-therapy-payment-mode').value,
                notes: document.getElementById('log-therapy-notes').value,
                status: document.getElementById('log-therapy-status').value
            };
            try {
                const resp = await fetch('/api/attendance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (resp.ok) {
                    showToast('Therapy session logged successfully!');
                    logModal.classList.remove('show');
                    if (document.getElementById('reports').classList.contains('active')) {
                        fetchReports();
                    }
                } else {
                    showToast('Error: ' + (await resp.json()).error, true);
                }
            } catch (err) {
                showToast('Failed to log therapy.', true);
            }
        });
    }

    // ── Reports Tab Logic ──────────────────────────────────────────
    const btnGenerateReport = document.getElementById('btn-generate-report');
    if (btnGenerateReport) {
        btnGenerateReport.addEventListener('click', fetchReports);
    }

    async function populateReportChildSelect() {
        const select = document.getElementById('report-child-select');
        if (!select) return;

        const currentActive = select.value;

        try {
            let children = await (await fetch('/api/children' + ((userRole === 'autism' || userRole === 'asd') ? '?autism=true' : ''))).json();
            const ageFilter = document.getElementById('report-age-filter')?.value || 'all';

            if (userRole === 'staff' || userRole === 'staff8' || userRole === 'autism' || userRole === 'asd' || userRole === 'asd' || (userRole === 'admin' && ageFilter !== 'all')) {
                children = children.filter(child => matchesAgeFilter(child, ageFilter));
            }
            
            select.innerHTML = '<option value="">All Children</option>';
            children.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = (c.admission_no ? `[${c.admission_no}] ` : '') + c.name;
                select.appendChild(opt);
            });

            if (Array.from(select.options).some(opt => opt.value === currentActive)) {
                select.value = currentActive;
            } else {
                select.value = '';
            }
        } catch (err) { console.error('Failed to load children for report filter', err); }
    }

    async function populateReportTherapistSelect() {
        const select = document.getElementById('report-therapist-select');
        if (!select) return;

        const currentActive = select.value;

        try {
            const therapists = await (await fetch('/api/therapists')).json();
            
            select.innerHTML = '<option value="">All Therapists</option>';
            const uniqueNames = [...new Set(therapists.map(t => t.name))];
            uniqueNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });

            if (Array.from(select.options).some(opt => opt.value === currentActive)) {
                select.value = currentActive;
            } else {
                select.value = '';
            }
        } catch (err) { console.error('Failed to load therapists for report filter', err); }
    }

    const reportChildSelect = document.getElementById('report-child-select');
    if (reportChildSelect) {
        reportChildSelect.addEventListener('change', fetchReports);
    }
    const reportTherapistSelect = document.getElementById('report-therapist-select');
    if (reportTherapistSelect) {
        reportTherapistSelect.addEventListener('change', fetchReports);
    }
    const reportAgeFilter = document.getElementById('report-age-filter');
    if (reportAgeFilter) {
        reportAgeFilter.addEventListener('change', () => {
            populateReportChildSelect();
            fetchReports();
        });
    }
    const reportPendingBalance = document.getElementById('report-pending-balance');
    if (reportPendingBalance) {
        reportPendingBalance.addEventListener('change', fetchReports);
    }

    const reportsTableBody = document.getElementById('reports-table-body');
    if (reportsTableBody) {
        reportsTableBody.addEventListener('change', async (e) => {
            if (e.target.classList.contains('edit-attendance')) {
                const tr = e.target.closest('tr');
                const id = tr.getAttribute('data-attendance-id');
                if (!id) return;

                const fee = parseFloat(tr.querySelector('[data-field="fee"]').value) || 0;
                const concession = parseFloat(tr.querySelector('[data-field="concession"]').value) || 0;
                const paid = parseFloat(tr.querySelector('[data-field="paid"]').value) || 0;
                let balance = parseFloat(tr.querySelector('[data-field="balance"]').value) || 0;

                if (e.target.dataset.field !== 'balance') {
                    balance = fee - concession - paid;
                    const balInput = tr.querySelector('[data-field="balance"]');
                    balInput.value = balance;
                    if (balance > 0) {
                        balInput.style.borderColor = 'var(--danger)';
                        balInput.style.color = 'var(--danger)';
                        balInput.style.fontWeight = 'bold';
                        balInput.style.background = '#fef2f2';
                    } else {
                        balInput.style.borderColor = '#ccc';
                        balInput.style.color = '';
                        balInput.style.fontWeight = '';
                        balInput.style.background = '';
                    }
                }

                // Update totals dynamically
                const childClass = Array.from(tr.classList).find(c => c.startsWith('accordion-child-'));
                if (childClass) {
                    const idx = childClass.replace('accordion-child-', '');
                    const allRows = reportsTableBody.querySelectorAll(`.${childClass}[data-attendance-id]`);
                    let sumF = 0, sumC = 0, sumP = 0, sumB = 0;
                    allRows.forEach(r => {
                        sumF += parseFloat(r.querySelector('[data-field="fee"]').value) || 0;
                        sumC += parseFloat(r.querySelector('[data-field="concession"]').value) || 0;
                        sumP += parseFloat(r.querySelector('[data-field="paid"]').value) || 0;
                        sumB += parseFloat(r.querySelector('[data-field="balance"]').value) || 0;
                    });
                    
                    const headerRow = reportsTableBody.querySelector(`.accordion-header[data-child-index="${idx}"]`);
                    if (headerRow) {
                        headerRow.querySelector('.header-fee').innerHTML = `<strong>${sumF}</strong>`;
                        headerRow.querySelector('.header-concession').innerHTML = `<strong>${sumC}</strong>`;
                        headerRow.querySelector('.header-paid').innerHTML = `<strong>${sumP}</strong>`;
                        const hBal = headerRow.querySelector('.header-balance');
                        hBal.innerHTML = `<strong>${sumB}</strong>`;
                        hBal.style.color = sumB > 0 ? 'var(--danger)' : '';
                    }

                    const footerRow = reportsTableBody.querySelector(`.${childClass}.footer-row`);
                    if (footerRow) {
                        footerRow.querySelector('.footer-fee').textContent = sumF;
                        footerRow.querySelector('.footer-concession').textContent = sumC;
                        footerRow.querySelector('.footer-paid').textContent = sumP;
                        const fBal = footerRow.querySelector('.footer-balance');
                        fBal.textContent = sumB;
                        fBal.style.color = sumB > 0 ? 'var(--danger)' : '';
                    }
                }

                try {
                    const res = await fetch(`/api/reports/attendance/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fee, concession, paid, balance, to_be_paid: Math.max(0, fee - concession) })
                    });
                    if (res.ok) {
                        showToast('Record updated successfully');
                    } else {
                        showToast('Failed to update record', true);
                    }
                } catch (err) {
                    showToast('Failed to update record', true);
                }
            }
        });

        reportsTableBody.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-delete-attendance');
            if (btn) {
                const id = btn.getAttribute('data-id');
                if (!confirm('Are you sure you want to delete this session?')) return;
                try {
                    const res = await fetch(`/api/reports/attendance/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Session deleted successfully');
                        fetchReports();
                    } else {
                        showToast('Failed to delete session', true);
                    }
                } catch (err) {
                    showToast('Failed to delete session', true);
                }
            }
        });
    }

    // Call this when switching to reports tab to ensure the child list is updated
    const originalSwitchTab = switchTab; // from top of file
    // Note: switchTab is globally defined at the top. We will hijack it slightly.
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-target') === 'reports') {
                populateReportChildSelect();
                populateReportTherapistSelect();
                // Optionally auto-fetch recent reports
                fetchReports();
            }
        });
    });

    async function fetchReports() {
        const tbody = document.getElementById('reports-table-body');
        if (!tbody) return;
        
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const childId = document.getElementById('report-child-select').value;

        let query = [];
        if (startDate) query.push('start_date=' + encodeURIComponent(startDate));
        if (endDate) query.push('end_date=' + encodeURIComponent(endDate));
        if (childId) query.push('child_id=' + encodeURIComponent(childId));
        if (userRole === 'autism' || userRole === 'asd') query.push('autism=true');
        
        const url = '/api/reports/attendance' + (query.length ? '?' + query.join('&') : '');

        try {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Loading...</td></tr>';
            const resp = await fetch(url);
            const data = await resp.json();
            
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align: center;">No therapy records found for this period.</td></tr>';
                resetDashboardMetrics();
                return;
            }
            
            // Client-side filtering for Therapist and Pending Balance
            const therapistFilter = document.getElementById('report-therapist-select')?.value;
            const pendingBalanceOnly = document.getElementById('report-pending-balance')?.checked;
            const ageFilter = document.getElementById('report-age-filter')?.value || 'all';
            
            const filteredData = data.filter(row => {
                let match = true;
                if (therapistFilter && row.therapist_name !== therapistFilter) match = false;
                if (pendingBalanceOnly && (parseFloat(row.balance) || 0) <= 0) match = false;
                
                if (userRole === 'staff' || userRole === 'staff8' || userRole === 'autism' || userRole === 'asd' || userRole === 'asd' || (userRole === 'admin' && ageFilter !== 'all')) {
                    if (!matchesAgeFilter(row, ageFilter)) match = false;
                }
                
                return match;
            });

            if (filteredData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align: center;">No matching records found.</td></tr>';
                resetDashboardMetrics();
                return;
            }

            let sumFee = 0, sumConcession = 0, sumPaid = 0, sumBalance = 0;
            let totalSessions = filteredData.length;
            let presentCount = 0;
            let html = '';

            // Group data by child
            const grouped = {};
            filteredData.forEach(row => {
                if (!grouped[row.child_id]) {
                    grouped[row.child_id] = { 
                        name: row.child_name, 
                        admission_no: row.child_admission_no,
                        rows: [], 
                        sumFee: 0, sumConcession: 0, sumPaid: 0, sumBalance: 0 
                    };
                }
                grouped[row.child_id].rows.push(row);
                grouped[row.child_id].sumFee += row.fee || 0;
                grouped[row.child_id].sumConcession += row.concession || 0;
                grouped[row.child_id].sumPaid += row.paid || 0;
                grouped[row.child_id].sumBalance += row.balance || 0;
                
                if (row.status === 'Present') presentCount++;
            });

            Object.values(grouped).forEach((group, index) => {
                sumFee += group.sumFee;
                sumConcession += group.sumConcession;
                sumPaid += group.sumPaid;
                sumBalance += group.sumBalance;
                
                const admBadge = group.admission_no ? `<span class="adm-badge" style="display:inline-block; font-size:0.75rem; background:#1e40af; color:#ffffff; border-radius:4px; padding:2px 7px; margin-right:8px; font-weight:700;">${group.admission_no}</span>` : '';

                // Header row
                html += `<tr class="accordion-header" data-child-index="${index}" style="cursor: pointer; background: #f8fafc;">
                    <td colspan="6"><strong><span class="toggle-icon">▼</span> ${admBadge}${group.name}</strong> <span style="color: #64748b; font-size: 0.9em; margin-left: 10px;">(${group.rows.length} session${group.rows.length > 1 ? 's' : ''})</span></td>
                    <td class="header-fee"><strong>${group.sumFee}</strong></td>
                    <td class="header-concession"><strong>${group.sumConcession}</strong></td>
                    <td class="header-paid"><strong>${group.sumPaid}</strong></td>
                    <td></td>
                    <td class="header-balance" style="${group.sumBalance > 0 ? 'color: var(--danger);' : ''}">
                        <strong>₹${group.sumBalance}</strong>
                    </td>
                    <td></td>
                </tr>`;

                // Detail rows
                group.rows.forEach(row => {
                    const therapyDisplay = row.sub_therapy 
                        ? `${row.therapy_type}<br><small style="color:gray;">${row.sub_therapy}</small>`
                        : row.therapy_type;

                    html += `<tr class="accordion-content accordion-child-${index}" style="display: none; background: #fff;" data-attendance-id="${row.id}">
                        <td>${formatDisplayDate(row.date)}</td>
                        <td style="color: #cbd5e1; text-align: center;">&#8627;</td>
                        <td>${row.time_slot || '-'}</td>
                        <td>${therapyDisplay}</td>
                        <td>${row.therapist_name || '-'}</td>
                        <td>
                            <span style="display:inline-block; padding:2px 6px; border-radius:4px; font-size:0.8rem; background:${row.status==='Present'?'#dcfce7':row.status.includes('Cancelled')?'#fef08a':'#fee2e2'}; color:${row.status==='Present'?'#166534':row.status.includes('Cancelled')?'#854d0e':'#991b1b'};">
                                ${row.status || 'Present'}
                            </span>
                        </td>
                        <td><input type="number" class="edit-attendance" data-field="fee" value="${row.fee || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td><input type="number" class="edit-attendance" data-field="concession" value="${row.concession || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td><input type="number" class="edit-attendance" data-field="paid" value="${row.paid || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td>${row.payment_mode || '-'}</td>
                        <td><input type="number" class="edit-attendance" data-field="balance" value="${row.balance || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px; ${row.balance > 0 ? 'border-color:var(--danger);color:var(--danger);font-weight:bold;background:#fef2f2;' : ''}"></td>
                        <td style="text-align: center; white-space: nowrap;">
                            <button type="button" class="btn-receipt-attendance" data-row-json="${encodeURIComponent(JSON.stringify(row))}" style="background: none; border: none; color: #2563eb; cursor: pointer; font-size: 1.05rem; margin-right: 4px;" title="Print Session Receipt PDF">🧾</button>
                            <button type="button" class="btn-delete-attendance" data-id="${row.id}" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.1rem;" title="Delete Session">🗑️</button>
                        </td>
                    </tr>`;
                });

                // Child-specific Totals row at the bottom of their folder
                html += `<tr class="accordion-content accordion-child-${index} footer-row" style="display: none; background: #f8fafc; font-weight: bold;">
                    <td colspan="6" style="text-align: right;">TOTALS:</td>
                    <td class="footer-fee">${group.sumFee}</td>
                    <td class="footer-concession">${group.sumConcession}</td>
                    <td class="footer-paid">${group.sumPaid}</td>
                    <td></td>
                    <td class="footer-balance" style="${group.sumBalance > 0 ? 'color: var(--danger);' : ''}">${group.sumBalance}</td>
                    <td></td>
                </tr>`;
            });

            tbody.innerHTML = html;

            // Add click listeners to toggle accordions
            tbody.querySelectorAll('.accordion-header').forEach(header => {
                header.addEventListener('click', () => {
                    const idx = header.getAttribute('data-child-index');
                    const rows = tbody.querySelectorAll(`.accordion-child-${idx}`);
                    const icon = header.querySelector('.toggle-icon');
                    
                    const isExpanded = rows[0].style.display !== 'none';
                    if (isExpanded) {
                        rows.forEach(r => r.style.display = 'none');
                        icon.textContent = '▼';
                    } else {
                        rows.forEach(r => r.style.display = 'table-row');
                        icon.textContent = '▲';
                    }
                });
            });



            // Single Receipt PDF generation listener
            tbody.querySelectorAll('.btn-receipt-attendance').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rowData = JSON.parse(decodeURIComponent(btn.getAttribute('data-row-json')));
                    generateSingleReceiptPdf(rowData);
                });
            });

            updateAttendanceGraph(filteredData);
            
            // Update Dashboard Metrics
            document.getElementById('metric-total-sessions').textContent = totalSessions;
            const attRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : 0;
            const attRateEl = document.getElementById('metric-attendance-rate');
            attRateEl.textContent = attRate + '%';
            attRateEl.style.color = attRate >= 80 ? 'var(--success)' : (attRate >= 50 ? 'var(--warning)' : 'var(--danger)');
            document.getElementById('metric-revenue').textContent = '₹' + sumPaid;
            document.getElementById('metric-balance').textContent = '₹' + sumBalance;
            window.currentReportData = filteredData; // Store for CSV export

        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: red;">Failed to load reports.</td></tr>';
            resetDashboardMetrics();
        }
    }
    
    function resetDashboardMetrics() {
        document.getElementById('metric-total-sessions').textContent = '0';
        document.getElementById('metric-attendance-rate').textContent = '0%';
        document.getElementById('metric-revenue').textContent = '₹0';
        document.getElementById('metric-balance').textContent = '₹0';
        window.currentReportData = [];
    }

    // View Toggles
    const btnViewTable = document.getElementById('btn-view-table');
    const btnViewGraph = document.getElementById('btn-view-graph');
    const printArea = document.getElementById('print-area');
    const graphArea = document.getElementById('graph-area');

    if (btnViewTable && btnViewGraph) {
        btnViewTable.addEventListener('click', () => {
            btnViewTable.className = 'btn-primary';
            btnViewGraph.className = 'btn-secondary';
            printArea.style.display = 'block';
            graphArea.style.display = 'none';
        });
        btnViewGraph.addEventListener('click', () => {
            btnViewGraph.className = 'btn-primary';
            btnViewTable.className = 'btn-secondary';
            printArea.style.display = 'none';
            graphArea.style.display = 'block';
        });
    }

    let attendanceChartInstance = null;
    let statusPieChartInstance = null;

    function updateAttendanceGraph(data) {
        const ctx = document.getElementById('attendanceChart');
        const pieCtx = document.getElementById('statusPieChart');
        if (!ctx) return;

        const childCounts = {};
        data.forEach(row => {
            const childName = row.child_name || 'Unknown Child';
            childCounts[childName] = (childCounts[childName] || 0) + 1;
        });

        // Sort by counts descending for better visual flow
        const sortedData = Object.entries(childCounts).sort((a, b) => b[1] - a[1]);
        const labels = sortedData.map(d => d[0]);
        const counts = sortedData.map(d => d[1]);

        if (attendanceChartInstance) {
            attendanceChartInstance.destroy();
        }

        if (typeof Chart !== 'undefined') {
            const canvasCtx = ctx.getContext('2d');
            
            // Create a cool vibrant gradient for the bars
            const gradient = canvasCtx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, '#6366f1'); // Indigo
            gradient.addColorStop(1, '#ec4899'); // Pink

            // Background gradient for hover
            const hoverGradient = canvasCtx.createLinearGradient(0, 0, 0, 400);
            hoverGradient.addColorStop(0, '#4f46e5');
            hoverGradient.addColorStop(1, '#db2777');

            Chart.defaults.font.family = "'Inter', sans-serif";
            Chart.defaults.color = '#64748b';

            attendanceChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Therapy Sessions',
                        data: counts,
                        backgroundColor: gradient,
                        hoverBackgroundColor: hoverGradient,
                        borderRadius: 8,
                        borderSkipped: false,
                        barThickness: 'flex',
                        maxBarThickness: 50
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 1500,
                        easing: 'easeOutQuart'
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleFont: { size: 14, weight: 'bold' },
                            bodyFont: { size: 13 },
                            padding: 12,
                            cornerRadius: 8,
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    return context.parsed.y + ' Session' + (context.parsed.y > 1 ? 's' : '');
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: '#f1f5f9',
                                drawBorder: false,
                            },
                            ticks: {
                                stepSize: 1,
                                padding: 10,
                                font: { weight: '500' }
                            }
                        },
                        x: {
                            grid: {
                                display: false,
                                drawBorder: false
                            },
                            ticks: {
                                padding: 10,
                                font: { weight: '600' }
                            }
                        }
                    }
                }
            });
            
            if (pieCtx) {
                if (statusPieChartInstance) {
                    statusPieChartInstance.destroy();
                }
                
                const statusCounts = { 'Present': 0, 'Absent / No-Show': 0, 'Cancelled by Parent': 0, 'Cancelled by Clinic': 0 };
                data.forEach(row => {
                    let s = row.status || 'Present';
                    if (s === 'Absent') s = 'Absent / No-Show';
                    if (statusCounts[s] !== undefined) statusCounts[s]++;
                    else statusCounts[s] = 1;
                });

                const pieLabels = Object.keys(statusCounts).filter(k => statusCounts[k] > 0);
                const pieData = pieLabels.map(k => statusCounts[k]);

                const pieColors = pieLabels.map(label => {
                    if (label === 'Present') return '#22c55e';
                    if (label.includes('Absent')) return '#ef4444';
                    return '#f59e0b';
                });

                statusPieChartInstance = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: pieLabels,
                        datasets: [{
                            data: pieData,
                            backgroundColor: pieColors,
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '65%',
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: { padding: 20, usePointStyle: true, font: { family: "'Inter', sans-serif" } }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                titleFont: { size: 14, weight: 'bold' },
                                bodyFont: { size: 13 },
                                padding: 12,
                                cornerRadius: 8
                            }
                        }
                    }
                });
            }
        }
    }

    const btnPrint = document.getElementById('btn-print-receipt');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            window.print();
        });
    }

    const btnExportStatementPdf = document.getElementById('btn-export-statement-pdf');
    if (btnExportStatementPdf) {
        btnExportStatementPdf.addEventListener('click', generateStatementPdf);
    }
    
    const btnExportCSV = document.getElementById('btn-export-csv');
    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', () => {
            if (!window.currentReportData || window.currentReportData.length === 0) {
                showToast('No data to export', true);
                return;
            }
            let csvContent = "\uFEFFDate,Admission No,Child Name,Time Slot,Therapy,Therapist,Status,Fee,Concession,Paid,Payment Mode,Balance\n";
            window.currentReportData.forEach(row => {
                const arr = [
                    row.date || '',
                    `"${(row.child_admission_no || '').replace(/"/g, '""')}"`,
                    `"${(row.child_name || '').replace(/"/g, '""')}"`,
                    row.time_slot || '',
                    `"${(row.therapy_type || '').replace(/"/g, '""')}"`,
                    `"${(row.therapist_name || '').replace(/"/g, '""')}"`,
                    row.status || 'Present',
                    row.fee || 0,
                    row.concession || 0,
                    row.paid || 0,
                    `"${(row.payment_mode || '').replace(/"/g, '""')}"`,
                    row.balance || 0
                ];
                csvContent += arr.join(",") + "\n";
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `therapy_report_${getLocalTodayDateString()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    // ── Therapies & Therapists Settings Logic ──────────────────────
    const therapistsTbody = document.getElementById('therapists-table-body');
    const therapyFeesTbody = document.getElementById('therapy-fees-table-body');
    const addTherapyForm = document.getElementById('add-therapy-form');
    const addTherapistForm = document.getElementById('add-therapist-form');

    let dynamicTherapyFees = [];
    let dynamicTherapists = [];

    // ── Individual Therapy Fees Management ──────────────────────────
    async function fetchTherapyFees() {
        const tbody = document.getElementById('therapy-fees-table-body');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading therapy fees...</td></tr>';
            const resp = await fetch('/api/therapy-fees');
            if (resp.ok) {
                dynamicTherapyFees = await resp.json();
            } else {
                dynamicTherapyFees = [];
            }

            // Fallback to default therapy fees list if DB table is currently empty
            if (dynamicTherapyFees.length === 0) {
                dynamicTherapyFees = Object.keys(THERAPY_DEFAULT_FEES).map((type, idx) => ({
                    id: idx + 1,
                    therapy_type: type,
                    fee: THERAPY_DEFAULT_FEES[type]
                }));
            }

            renderTherapyFeesTable();
            populateTherapyDropdowns();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Failed to load therapy fees.</td></tr>';
        }
    }

    function renderTherapyFeesTable() {
        const tbody = document.getElementById('therapy-fees-table-body');
        if (!tbody) return;

        if (dynamicTherapyFees.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No therapy fee records.</td></tr>';
            return;
        }

        tbody.innerHTML = dynamicTherapyFees.map((tf, idx) => `
            <tr>
                <td><strong>${tf.therapy_type}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-weight: 600; color: var(--text-light);">₹</span>
                        <input type="number" id="fee-inp-${idx}" value="${tf.fee !== undefined ? tf.fee : 0}" min="0" step="10"
                               style="width: 100px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color); font-weight: 600;"
                               onkeydown="if(event.key==='Enter'){ event.preventDefault(); saveTherapyFeeByIndex(${idx}); }">
                    </div>
                </td>
                <td style="text-align: center;">
                    <button type="button" class="btn-secondary btn-sm" onclick="saveTherapyFeeByIndex(${idx})" style="color: var(--primary); border-color: var(--primary); margin-right: 4px;">
                        💾 Save
                    </button>
                    ${tf.id ? `<button type="button" class="btn-secondary btn-sm" onclick="deleteTherapyFeeByIndex(${idx})" style="color: var(--danger); border-color: var(--danger);">Delete</button>` : ''}
                </td>
            </tr>
        `).join('');
    }

    window.saveTherapyFeeByIndex = function(idx) {
        const item = dynamicTherapyFees[idx];
        if (!item) return;
        const inp = document.getElementById(`fee-inp-${idx}`);
        const feeVal = inp ? inp.value : item.fee;
        saveTherapyFee(item.therapy_type, feeVal);
    };

    window.deleteTherapyFeeByIndex = function(idx) {
        const item = dynamicTherapyFees[idx];
        if (!item) return;
        deleteTherapyFee(item.id, item.therapy_type);
    };

    window.saveTherapyFee = async function(therapyType, newFeeVal) {
        const numFee = parseFloat(newFeeVal) || 0;
        try {
            const resp = await fetch('/api/therapy-fees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ therapy_type: therapyType, fee: numFee })
            });

            if (resp.ok) {
                const updated = await resp.json();
                showToast(`✅ Fee for "${therapyType}" set to ₹${numFee}`);
                const match = dynamicTherapyFees.find(t => t.therapy_type === therapyType);
                if (match) {
                    match.fee = numFee;
                    if (updated.id) match.id = updated.id;
                } else {
                    dynamicTherapyFees.push(updated);
                }
                populateTherapyDropdowns();
            } else {
                const errData = await resp.json().catch(() => ({}));
                showToast(errData.error ? `Failed: ${errData.error}` : 'Failed to save therapy fee', true);
            }
        } catch (err) {
            showToast('Error saving therapy fee: ' + (err.message || 'Network error'), true);
        }
    };

    window.deleteTherapyFee = async function(id, therapyType) {
        if (!confirm(`Are you sure you want to remove the therapy "${therapyType}"?`)) return;
        try {
            const resp = await fetch('/api/therapy-fees/' + id, { method: 'DELETE' });
            if (resp.ok) {
                showToast(`Therapy "${therapyType}" removed`);
                fetchTherapyFees();
            } else {
                const errData = await resp.json().catch(() => ({}));
                showToast(errData.error ? `Failed: ${errData.error}` : 'Failed to delete therapy', true);
            }
        } catch (err) {
            showToast('Error deleting therapy: ' + (err.message || 'Network error'), true);
        }
    };

    // ── Add New Therapy Form Handler ──────────────────────────────
    if (addTherapyForm) {
        addTherapyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-therapy-name').value.trim();
            const fee = parseFloat(document.getElementById('new-therapy-fee').value) || 0;
            if (!name) return;

            try {
                const resp = await fetch('/api/therapy-fees', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ therapy_type: name, fee })
                });

                if (resp.ok) {
                    showToast(`✅ Therapy "${name}" added!`);
                    addTherapyForm.reset();
                    fetchTherapyFees();
                } else {
                    const err = await resp.json();
                    showToast('Failed to add therapy: ' + (err.error || 'Server error'), true);
                }
            } catch (err) {
                showToast('Error adding therapy', true);
            }
        });
    }

    // ── Update All Therapy Dropdowns Across App ─────────────────────
    function populateTherapyDropdowns() {
        const therapyNames = dynamicTherapyFees.map(tf => tf.therapy_type);
        Object.keys(THERAPY_DEFAULT_FEES).forEach(t => {
            if (!therapyNames.includes(t)) therapyNames.push(t);
        });

        // 1. Log Therapy Dropdown
        const logTypeSelect = document.getElementById('log-therapy-type');
        if (logTypeSelect) {
            const curVal = logTypeSelect.value;
            logTypeSelect.innerHTML = '<option value="">Select...</option>' +
                therapyNames.map(t => `<option value="${t}">${t}</option>`).join('');
            if (curVal && therapyNames.includes(curVal)) logTypeSelect.value = curVal;
        }

        // 2. Daily Schedule Modal Therapy Dropdown
        const schedTypeSelect = document.getElementById('schedule-therapy-type');
        if (schedTypeSelect) {
            const curVal = schedTypeSelect.value;
            schedTypeSelect.innerHTML = '<option value="">Select...</option>' +
                therapyNames.map(t => `<option value="${t}">${t}</option>`).join('');
            if (curVal && therapyNames.includes(curVal)) schedTypeSelect.value = curVal;
        }
    }

    // ── Therapist Roster Management (No Fees) ──────────────────────
    async function fetchTherapists() {
        const tbody = document.getElementById('therapists-table-body');
        if (!tbody) return;
        try {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Loading therapists...</td></tr>';
            const resp = await fetch('/api/therapists');
            if (resp.ok) {
                dynamicTherapists = await resp.json();
            } else {
                dynamicTherapists = [];
            }
            
            if (dynamicTherapists.length === 0) {
                dynamicTherapists = DEFAULT_THERAPISTS.map((name, idx) => ({ id: idx + 1, name }));
            }
            
            tbody.innerHTML = dynamicTherapists.map(t => 
                `<tr>
                    <td><strong>${t.name}</strong></td>
                    <td style="text-align: center;">
                        <button type="button" class="btn-secondary btn-sm" onclick="deleteTherapist(${t.id}, '${t.name.replace(/'/g, "\\'")}')" style="color: var(--danger); border-color: var(--danger);">Delete</button>
                    </td>
                </tr>`
            ).join('');
            
            populateTherapistDropdowns();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: red;">Failed to load therapists.</td></tr>';
        }
    }

    function populateTherapistDropdowns() {
        const uniqueNames = [...new Set(dynamicTherapists.map(t => t.name).filter(Boolean))];
        if (uniqueNames.length === 0) {
            DEFAULT_THERAPISTS.forEach(n => {
                if (!uniqueNames.includes(n)) uniqueNames.push(n);
            });
        }

        const logSelect = document.getElementById('log-therapy-therapist');
        if (logSelect) {
            const currentVal = logSelect.value;
            logSelect.innerHTML = '<option value="">Select Therapist...</option>' +
                uniqueNames.map(n => `<option value="${n}">${n}</option>`).join('');
            if (currentVal && uniqueNames.includes(currentVal)) {
                logSelect.value = currentVal;
            }
        }

        const schedSelect = document.getElementById('schedule-therapist');
        if (schedSelect) {
            const currentVal = schedSelect.value;
            schedSelect.innerHTML = '<option value="">Select Therapist...</option>' +
                uniqueNames.map(n => `<option value="${n}">${n}</option>`).join('');
            if (currentVal && uniqueNames.includes(currentVal)) {
                schedSelect.value = currentVal;
            }
        }
    }

    window.deleteTherapist = async function(id, name) {
        const label = name ? ` "${name}"` : '';
        if (!confirm(`Are you sure you want to remove therapist${label}?`)) return;
        try {
            const r = await fetch('/api/therapists/' + id, { method: 'DELETE' });
            if (r.ok) {
                showToast(`Therapist${label} removed`);
                fetchTherapists();
            } else {
                showToast('Error deleting therapist', true);
            }
        } catch (e) {
            showToast('Failed to delete', true);
        }
    };

    if (addTherapistForm) {
        addTherapistForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('new-therapist-name');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) return;

            try {
                const resp = await fetch('/api/therapists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                if (resp.ok) {
                    showToast(`✅ Therapist "${name}" added!`);
                    addTherapistForm.reset();
                    fetchTherapists();
                } else {
                    const err = await resp.json().catch(() => ({}));
                    showToast(err.error || 'Error adding therapist', true);
                }
            } catch (err) {
                showToast('Failed to add therapist', true);
            }
        });
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-target') === 'therapies-settings') {
                fetchTherapyFees();
            }
            if (item.getAttribute('data-target') === 'therapists-settings') {
                fetchTherapists();
            }
            if (item.getAttribute('data-target') === 'schedule') {
                const schedDate = document.getElementById('schedule-date');
                if (schedDate && !schedDate.value) {
                    schedDate.value = getLocalTodayDateString();
                }
                loadDailySchedule();
            }
        });
    });

    // ── Daily Schedule Logic ──────────────────────────────────────────
    const TIME_SLOTS = [
        "10.00 - 10.30", "10.30 - 11.00", "11.00 - 11.30", "11.30 - 12.00",
        "12.00 - 12.30", "12.30 - 1.00", "1.00 - 1.30", "2.00 - 2.30",
        "2.30 - 3.00", "3.00 - 3.30", "3.30 - 4.00", "4.00 - 4.30", "4.30 - 5.00"
    ];
    let currentScheduleData = [];
    let scheduleChildrenList = [];
    let selectedScheduleChildIds = new Set();
    let selectedFilterChildIds = new Set();

    function matchesScheduleCategory(child, category = 'all') {
        if (!category || category === 'all') return true;
        const isAutism = isAutismChild(child);
        const adm = (child.admission_no || '').trim().toUpperCase();
        const isTH = adm.startsWith('TH');
        const isEIC = adm.startsWith('EIC');
        const ageNum = extractChildAge(child);

        if (category === 'asd' || category === 'autism') {
            return isAutism;
        }
        if (category === 'th' || category === '8plus') {
            if (isAutism) return false;
            if (isTH) return true;
            if (isEIC) return ageNum >= 8 && !!child.dob;
            return ageNum >= 8;
        }
        if (category === 'eic' || category === 'under8') {
            if (isAutism) return false;
            if (isTH) return false;
            if (isEIC) return true;
            return ageNum < 8;
        }
        return true;
    }

    function getPermittedScheduleChildren() {
        let list = scheduleChildrenList;
        if (userRole === 'staff' || userRole === 'staff8' || userRole === 'autism' || userRole === 'asd') {
            list = scheduleChildrenList.filter(child => matchesAgeFilter(child));
        }
        const categoryFilter = document.getElementById('schedule-category-filter')?.value || 'all';
        if (categoryFilter !== 'all') {
            list = list.filter(child => matchesScheduleCategory(child, categoryFilter));
        }
        return list;
    }

    const scheduleCategoryFilter = document.getElementById('schedule-category-filter');
    if (scheduleCategoryFilter) {
        ['change', 'input'].forEach(evtName => {
            scheduleCategoryFilter.addEventListener(evtName, () => {
                selectedFilterChildIds.clear();
                selectedScheduleChildIds.clear();
                const permittedChildren = getPermittedScheduleChildren();
                renderScheduleFilterOptions(permittedChildren);
                updateScheduleFilterUI();
                renderDailyScheduleTable();
            });
        });
    }

    const scheduleDateInput = document.getElementById('schedule-date');
    let previousScheduleDate = scheduleDateInput ? scheduleDateInput.value : '';
    if (scheduleDateInput) {
        scheduleDateInput.addEventListener('change', () => {
            if (pendingScheduleChanges && pendingScheduleChanges.size > 0) {
                if (!confirm(`You have ${pendingScheduleChanges.size} unsaved schedule change(s). Discard them and switch date?`)) {
                    scheduleDateInput.value = previousScheduleDate;
                    return;
                }
                pendingScheduleChanges.clear();
                updateScheduleSaveButtonUI();
            }
            previousScheduleDate = scheduleDateInput.value;
            loadDailySchedule();
        });
    }

    const scheduleFilterInput = document.getElementById('schedule-child-filter');
    if (scheduleFilterInput) {
        scheduleFilterInput.addEventListener('change', loadDailySchedule);
    }

    const scheduleHideUnscheduled = document.getElementById('schedule-hide-unscheduled');
    if (scheduleHideUnscheduled) {
        scheduleHideUnscheduled.addEventListener('change', () => {
            renderDailyScheduleTable();
        });
    }

    // ── Schedule Child Multi-Select Filter Handlers ──────────────────
    const multiselectWrapper = document.getElementById('schedule-child-multiselect');
    const multiselectBtn = document.getElementById('schedule-child-multiselect-btn');
    const multiselectDropdown = document.getElementById('schedule-multiselect-dropdown');
    const multiselectClearBtn = document.getElementById('schedule-multiselect-clear');
    const multiselectDoneBtn = document.getElementById('btn-schedule-multiselect-done');
    const multiselectSearchInput = document.getElementById('schedule-multiselect-search');
    const multiselectSearchClear = document.getElementById('schedule-multiselect-search-clear');
    const multiselectList = document.getElementById('schedule-multiselect-list');

    function openScheduleMultiselect() {
        if (!multiselectDropdown) return;
        multiselectDropdown.style.display = 'flex';
        multiselectBtn?.classList.add('active');
        multiselectBtn?.setAttribute('aria-expanded', 'true');
        if (multiselectSearchInput) {
            multiselectSearchInput.value = '';
            filterMultiselectOptions('');
            setTimeout(() => multiselectSearchInput.focus(), 60);
        }
    }

    function closeScheduleMultiselect() {
        if (!multiselectDropdown) return;
        multiselectDropdown.style.display = 'none';
        multiselectBtn?.classList.remove('active');
        multiselectBtn?.setAttribute('aria-expanded', 'false');
    }

    function toggleScheduleMultiselect() {
        if (!multiselectDropdown) return;
        if (multiselectDropdown.style.display === 'none' || !multiselectDropdown.style.display) {
            openScheduleMultiselect();
        } else {
            closeScheduleMultiselect();
        }
    }

    if (multiselectBtn) {
        multiselectBtn.addEventListener('click', (e) => {
            if (e.target.closest('#schedule-multiselect-clear')) return;
            toggleScheduleMultiselect();
        });
    }

    if (multiselectClearBtn) {
        multiselectClearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearScheduleFilter();
        });
    }

    if (multiselectDoneBtn) {
        multiselectDoneBtn.addEventListener('click', () => {
            closeScheduleMultiselect();
        });
    }

    document.addEventListener('click', (e) => {
        if (multiselectWrapper && !multiselectWrapper.contains(e.target)) {
            closeScheduleMultiselect();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && multiselectDropdown && multiselectDropdown.style.display !== 'none') {
            closeScheduleMultiselect();
        }
    });

    if (multiselectSearchInput) {
        multiselectSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (multiselectSearchClear) {
                multiselectSearchClear.style.display = query ? 'block' : 'none';
            }
            filterMultiselectOptions(query);
        });
    }

    if (multiselectSearchClear) {
        multiselectSearchClear.addEventListener('click', () => {
            if (multiselectSearchInput) {
                multiselectSearchInput.value = '';
                multiselectSearchClear.style.display = 'none';
                filterMultiselectOptions('');
                multiselectSearchInput.focus();
            }
        });
    }

    function filterMultiselectOptions(query) {
        const items = document.querySelectorAll('#schedule-multiselect-list .multiselect-option-item');
        let visibleCount = 0;
        items.forEach(item => {
            const name = item.dataset.name || '';
            const adm = item.dataset.adm || '';
            if (!query || name.includes(query) || adm.includes(query)) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        let emptyEl = document.getElementById('multiselect-empty-message');
        if (visibleCount === 0) {
            if (!emptyEl && multiselectList) {
                emptyEl = document.createElement('div');
                emptyEl.id = 'multiselect-empty-message';
                emptyEl.className = 'multiselect-empty';
                emptyEl.textContent = 'No matching children found';
                multiselectList.appendChild(emptyEl);
            } else if (emptyEl) {
                emptyEl.style.display = 'block';
            }
        } else if (emptyEl) {
            emptyEl.style.display = 'none';
        }
    }

    document.getElementById('btn-filter-select-all')?.addEventListener('click', () => {
        const permitted = getPermittedScheduleChildren();
        const searchVal = multiselectSearchInput ? multiselectSearchInput.value.toLowerCase().trim() : '';
        if (searchVal) {
            document.querySelectorAll('#schedule-multiselect-list .multiselect-option-item').forEach(item => {
                if (item.style.display !== 'none') {
                    const cid = item.dataset.childId;
                    if (cid) selectedFilterChildIds.add(String(cid));
                }
            });
        } else {
            permitted.forEach(c => selectedFilterChildIds.add(String(c.id)));
        }
        syncFilterCheckboxes();
        updateScheduleFilterUI();
        renderDailyScheduleTable();
    });

    document.getElementById('btn-filter-select-scheduled')?.addEventListener('click', () => {
        selectedFilterChildIds.clear();
        const permitted = getPermittedScheduleChildren();
        const scheduled = permitted.filter(c => currentScheduleData.some(s => s.child_id === c.id));
        if (scheduled.length === 0) {
            showToast('No children have scheduled sessions on this date', true);
        } else {
            scheduled.forEach(c => selectedFilterChildIds.add(String(c.id)));
        }
        syncFilterCheckboxes();
        updateScheduleFilterUI();
        renderDailyScheduleTable();
    });

    document.getElementById('btn-filter-clear-all')?.addEventListener('click', () => {
        clearScheduleFilter();
    });

    function clearScheduleFilter() {
        selectedFilterChildIds.clear();
        syncFilterCheckboxes();
        updateScheduleFilterUI();
        renderDailyScheduleTable();
    }

    function syncFilterCheckboxes() {
        document.querySelectorAll('#schedule-multiselect-list .multiselect-option-item').forEach(item => {
            const cid = item.dataset.childId;
            const cb = item.querySelector('.multiselect-option-cb');
            const isChecked = selectedFilterChildIds.has(String(cid));
            if (cb) cb.checked = isChecked;
            if (isChecked) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    if (multiselectList) {
        multiselectList.addEventListener('change', (e) => {
            const cb = e.target.closest('.multiselect-option-cb');
            if (!cb) return;
            const cid = String(cb.dataset.id);
            const parentLabel = cb.closest('.multiselect-option-item');
            if (cb.checked) {
                selectedFilterChildIds.add(cid);
                if (parentLabel) parentLabel.classList.add('selected');
            } else {
                selectedFilterChildIds.delete(cid);
                if (parentLabel) parentLabel.classList.remove('selected');
            }
            updateScheduleFilterUI();
            renderDailyScheduleTable();
        });
    }

    function renderScheduleFilterOptions(permittedChildren) {
        if (!multiselectList) return;
        if (!permittedChildren || permittedChildren.length === 0) {
            multiselectList.innerHTML = '<div class="multiselect-empty">No permitted children found</div>';
            return;
        }

        let html = '';
        permittedChildren.forEach(child => {
            const cid = String(child.id);
            const isChecked = selectedFilterChildIds.has(cid);
            const sessionsCount = currentScheduleData.filter(s => s.child_id === child.id).length;
            const schedBadge = sessionsCount > 0 
                ? `<span class="multiselect-sched-pill" title="${sessionsCount} session(s) scheduled today">● ${sessionsCount} sched</span>`
                : '';
            const admBadge = child.admission_no 
                ? `<span class="multiselect-adm-tag">${child.admission_no}</span>`
                : '';

            html += `
                <label class="multiselect-option-item${isChecked ? ' selected' : ''}" data-child-id="${child.id}" data-name="${(child.name || '').toLowerCase()}" data-adm="${(child.admission_no || '').toLowerCase()}">
                    <input type="checkbox" class="multiselect-option-cb" data-id="${child.id}" ${isChecked ? 'checked' : ''}>
                    ${admBadge}
                    <span class="multiselect-name-text">${child.name}</span>
                    ${schedBadge}
                </label>
            `;
        });
        multiselectList.innerHTML = html;
    }

    function updateScheduleFilterUI() {
        const permitted = getPermittedScheduleChildren();
        const labelEl = document.getElementById('schedule-multiselect-label');
        const clearBtn = document.getElementById('schedule-multiselect-clear');
        const countEl = document.getElementById('schedule-multiselect-count');
        const footerStatus = document.getElementById('schedule-multiselect-footer-status');

        const totalSelected = selectedFilterChildIds.size;
        const totalPermitted = permitted.length;

        if (labelEl) {
            if (totalSelected === 0) {
                labelEl.textContent = 'All Children';
                if (clearBtn) clearBtn.style.display = 'none';
            } else if (totalSelected === 1) {
                const singleId = Array.from(selectedFilterChildIds)[0];
                const child = permitted.find(c => String(c.id) === singleId);
                const name = child ? ((child.admission_no ? `[${child.admission_no}] ` : '') + child.name) : '1 Child Selected';
                labelEl.innerHTML = `<span class="filter-pill">1</span> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${name}</span>`;
                if (clearBtn) clearBtn.style.display = 'inline-flex';
            } else if (totalSelected === 2) {
                const names = Array.from(selectedFilterChildIds).map(id => permitted.find(c => String(c.id) === id)?.name || id);
                labelEl.innerHTML = `<span class="filter-pill">2 Selected</span> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${names.join(', ')}</span>`;
                if (clearBtn) clearBtn.style.display = 'inline-flex';
            } else {
                const names = Array.from(selectedFilterChildIds).slice(0, 2).map(id => permitted.find(c => String(c.id) === id)?.name || id);
                const rem = totalSelected - 2;
                labelEl.innerHTML = `<span class="filter-pill">${totalSelected} Selected</span> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${names.join(', ')} +${rem} more</span>`;
                if (clearBtn) clearBtn.style.display = 'inline-flex';
            }
        }

        if (countEl) {
            countEl.textContent = totalSelected === 0 
                ? `All (${totalPermitted})` 
                : `${totalSelected} of ${totalPermitted} selected`;
        }

        if (footerStatus) {
            footerStatus.textContent = totalSelected === 0 
                ? 'Showing all children' 
                : `Showing ${totalSelected} selected child(ren)`;
        }

        const legacySelect = document.getElementById('schedule-child-filter');
        if (legacySelect) {
            legacySelect.value = totalSelected === 1 ? Array.from(selectedFilterChildIds)[0] : '';
        }
    }

    function renderDailyScheduleTable() {
        const tbody = document.getElementById('schedule-table-body');
        if (!tbody) return;

        const permittedChildren = getPermittedScheduleChildren();
        if (permittedChildren.length === 0) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align: center;">No permitted children registered.</td></tr>';
            updateScheduleSelectionUI();
            return;
        }

        const hideUnscheduled = document.getElementById('schedule-hide-unscheduled')?.checked;

        let filteredChildren = permittedChildren;
        if (selectedFilterChildIds.size > 0) {
            filteredChildren = permittedChildren.filter(c => selectedFilterChildIds.has(String(c.id)));
        }
        if (hideUnscheduled) {
            filteredChildren = filteredChildren.filter(c => currentScheduleData.some(s => s.child_id === c.id));
        }

        if (filteredChildren.length === 0) {
            const msg = selectedFilterChildIds.size > 0 
                ? 'No therapy sessions found for the selected child(ren) on this date.'
                : 'No therapy sessions scheduled for this date.';
            tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; color: var(--text-light); padding: 25px;">${msg}</td></tr>`;
            updateScheduleSelectionUI();
            return;
        }

        let html = '';
        filteredChildren.forEach((child, index) => {
            const childHasSessions = currentScheduleData.some(s => s.child_id === child.id);
            const rowClass = childHasSessions ? 'has-sessions' : 'schedule-row-empty';
            const isSelected = selectedScheduleChildIds.has(String(child.id));
            const rowSelectedClass = isSelected ? ' schedule-row-selected' : '';
            const admBadge = child.admission_no ? `<span class="adm-badge" style="display:inline-block; font-size:0.75rem; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:4px; padding:1px 6px; font-weight:700; margin-bottom:3px;">${child.admission_no}</span><br>` : '';
            const cb = `<input type="checkbox" class="schedule-child-cb" data-child-id="${child.id}" ${isSelected ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px; accent-color: #2563eb; margin-top: 3px; flex-shrink: 0;">`;
            html += `<tr class="${rowClass}${rowSelectedClass}" data-child-id="${child.id}">`;
            html += `<td class="sticky-col" data-child-id="${child.id}" style="min-width: 195px;">
                        <div style="display: flex; align-items: flex-start; gap: 8px;">
                            ${cb}
                            <div>
                                <span style="font-size: 0.82rem; color: #64748b;">${index + 1}.</span>
                                ${admBadge}
                                <strong style="color: #1e293b; font-size: 0.94rem;">${child.name}</strong>
                            </div>
                        </div>
                     </td>`;
            
            TIME_SLOTS.forEach(slot => {
                const slotKey = `${child.id}_${slot}`;
                const pending = (typeof pendingScheduleChanges !== 'undefined') ? pendingScheduleChanges.get(slotKey) : null;
                
                if (pending && pending.action === 'delete') {
                    html += `<td data-child="${child.id}" data-childadm="${child.admission_no || ''}" data-childname="${child.name}" data-slot="${slot}">
                                <div class="pending-delete-cell" title="Marked for deletion (Unsaved)"></div>
                             </td>`;
                    return;
                }

                const block = currentScheduleData.find(s => s.child_id === child.id && s.time_slot === slot);
                
                if (block) {
                    let colorClass = 'sched-other';
                    const t = block.therapy_type.toLowerCase();
                    if (t.includes('physio')) colorClass = 'sched-physio';
                    else if (t.includes('occupational') || t.includes('ot')) colorClass = 'sched-ot';
                    else if (t.includes('hydro')) colorClass = 'sched-hydro';
                    else if (t.includes('music')) colorClass = 'sched-music';
                    else if (t.includes('speech')) colorClass = 'sched-speech';
                    else if (t.includes('assessment')) colorClass = 'sched-assessment';

                    let shortTherapy = block.therapy_type.split(' ')[0];
                    if (block.therapy_type === 'Occupational Therapy') shortTherapy = 'OT';

                    const isDraft = pending && pending.action === 'set';
                    const draftClass = isDraft ? ' pending-save' : '';
                    const draftTitle = isDraft ? ' title="Unsaved schedule change"' : '';

                    html += `<td data-child="${child.id}" data-childadm="${child.admission_no || ''}" data-childname="${child.name}" data-slot="${slot}" data-id="${block.id}" data-type="${block.therapy_type}" data-therapist="${block.therapist_name || ''}">
                                <div class="schedule-cell ${colorClass}${draftClass}"${draftTitle}>
                                    <span>${shortTherapy}</span>
                                    <span class="therapist-name">(${block.therapist_name || 'TBD'})</span>
                                </div>
                             </td>`;
                } else {
                    html += `<td data-child="${child.id}" data-childadm="${child.admission_no || ''}" data-childname="${child.name}" data-slot="${slot}"></td>`;
                }
            });
            
            html += `</tr>`;
        });
        tbody.innerHTML = html;
        updateScheduleSelectionUI();
    }

    async function loadDailySchedule() {
        const tbody = document.getElementById('schedule-table-body');
        if (!tbody) return;
        const date = scheduleDateInput ? scheduleDateInput.value : '';
        if (!date) return;

        tbody.innerHTML = '<tr><td colspan="14" style="text-align: center;">Loading...</td></tr>';
        try {
            // Fresh children list
            const respChild = await fetch('/api/children' + ((userRole === 'autism' || userRole === 'asd') ? '?autism=true' : ''));
            scheduleChildrenList = await respChild.json();

            const permittedChildren = getPermittedScheduleChildren();

            // Fetch schedules for the date
            const schedUrl = `/api/schedules?date=${encodeURIComponent(date)}` + ((userRole === 'autism' || userRole === 'asd') ? '&autism=true' : '');
            const respSched = await fetch(schedUrl);
            currentScheduleData = await respSched.json();

            // Prune filter selection of any child no longer permitted/existing
            const validIds = new Set(permittedChildren.map(c => String(c.id)));
            for (const id of selectedFilterChildIds) {
                if (!validIds.has(id)) selectedFilterChildIds.delete(id);
            }

            if (typeof pendingScheduleChanges !== 'undefined') {
                pendingScheduleChanges.clear();
                updateScheduleSaveButtonUI();
            }
            renderScheduleFilterOptions(permittedChildren);
            updateScheduleFilterUI();
            renderDailyScheduleTable();
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="14" style="text-align: center; color: red;">Failed to load schedule.</td></tr>';
        }
    }

    // Initialize Schedule Modal options
    const schedTherapySelect = document.getElementById('schedule-therapy-type');
    const logTherapySelect = document.getElementById('log-therapy-type');
    if (schedTherapySelect && logTherapySelect) {
        schedTherapySelect.innerHTML = logTherapySelect.innerHTML;
    }

    // Schedule Modal handling
    const scheduleModal = document.getElementById('schedule-modal');
    const scheduleForm = document.getElementById('schedule-form');
    let currentScheduleBlockId = null;

    if (schedTherapySelect) {
        schedTherapySelect.addEventListener('change', () => {
            // Therapists are independently selectable; therapy type does not dictate therapist
        });
    }

    document.getElementById('schedule-table-body')?.addEventListener('click', (e) => {
        const cb = e.target.closest('.schedule-child-cb');
        if (cb) {
            const childId = String(cb.dataset.childId);
            if (cb.checked) {
                selectedScheduleChildIds.add(childId);
            } else {
                selectedScheduleChildIds.delete(childId);
            }
            updateScheduleSelectionUI();
            return;
        }

        const stickyTd = e.target.closest('td.sticky-col');
        if (stickyTd && !e.target.closest('a') && !e.target.closest('button')) {
            const childCb = stickyTd.querySelector('.schedule-child-cb');
            if (childCb && e.target !== childCb) {
                childCb.checked = !childCb.checked;
                const childId = String(childCb.dataset.childId);
                if (childCb.checked) {
                    selectedScheduleChildIds.add(childId);
                } else {
                    selectedScheduleChildIds.delete(childId);
                }
                updateScheduleSelectionUI();
            }
            return;
        }

        const td = e.target.closest('td');
        if (!td || td.classList.contains('sticky-col')) return;

        const childId = td.dataset.child;
        const childName = td.dataset.childname;
        const childAdm = td.dataset.childadm ? `[${td.dataset.childadm}] ` : '';
        const timeSlot = td.dataset.slot;
        const blockId = td.dataset.id;
        
        document.getElementById('schedule-child-id').value = childId;
        document.getElementById('schedule-time-slot').value = timeSlot;
        document.getElementById('schedule-modal-subtitle').textContent = `For ${childAdm}${childName} at ${timeSlot}`;
        
        currentScheduleBlockId = blockId || null;
        
        const deleteBtn = document.getElementById('btn-delete-schedule');
        const hasExisting = Boolean(blockId || td.dataset.type);
        if (hasExisting) {
            document.getElementById('schedule-therapy-type').value = td.dataset.type || '';
            document.getElementById('schedule-therapist').value = td.dataset.therapist || '';
            deleteBtn.style.display = 'block';
        } else {
            scheduleForm.reset();
            document.getElementById('schedule-child-id').value = childId;
            document.getElementById('schedule-time-slot').value = timeSlot;
            document.getElementById('schedule-therapy-type').value = '';
            document.getElementById('schedule-therapist').value = '';
            deleteBtn.style.display = 'none';
        }
        
        scheduleModal.classList.add('show');
    });

    scheduleModal?.querySelector('.close-modal')?.addEventListener('click', () => {
        scheduleModal.classList.remove('show');
    });
    window.addEventListener('click', e => {
        if (e.target === scheduleModal) scheduleModal.classList.remove('show');
    });

    // ── Schedule Draft & Batch Save Logic (No page refresh on cell edit) ──
    const pendingScheduleChanges = new Map(); // key: `${child_id}_${time_slot}`

    function updateScheduleSaveButtonUI() {
        const count = pendingScheduleChanges.size;
        const btnSave = document.getElementById('btn-save-schedule');
        const btnText = document.getElementById('btn-save-schedule-text');
        const badge = document.getElementById('schedule-unsaved-badge');
        const unsavedBar = document.getElementById('schedule-unsaved-bar');
        const countText = document.getElementById('schedule-unsaved-count-text');

        if (count > 0) {
            if (btnSave) {
                btnSave.classList.add('has-unsaved');
            }
            if (btnText) btnText.textContent = `Save Schedule (${count})`;
            if (badge) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            }
            if (unsavedBar) {
                unsavedBar.style.display = 'flex';
                if (countText) countText.textContent = count;
            }
        } else {
            if (btnSave) {
                btnSave.classList.remove('has-unsaved');
            }
            if (btnText) btnText.textContent = 'Save Schedule';
            if (badge) badge.style.display = 'none';
            if (unsavedBar) unsavedBar.style.display = 'none';
        }
    }

    function stageScheduleChange(change) {
        const key = `${change.child_id}_${change.time_slot}`;
        pendingScheduleChanges.set(key, change);

        const cid = parseInt(change.child_id, 10);
        if (change.action === 'set') {
            const existingIdx = currentScheduleData.findIndex(s => s.child_id === cid && s.time_slot === change.time_slot);
            if (existingIdx >= 0) {
                currentScheduleData[existingIdx].therapy_type = change.therapy_type;
                currentScheduleData[existingIdx].therapist_name = change.therapist_name;
            } else {
                currentScheduleData.push({
                    id: change.block_id || `temp_${Date.now()}`,
                    child_id: cid,
                    date: change.date,
                    time_slot: change.time_slot,
                    therapy_type: change.therapy_type,
                    therapist_name: change.therapist_name
                });
            }

            // In-place DOM update without refresh
            const td = document.querySelector(`td[data-child="${change.child_id}"][data-slot="${change.time_slot}"]`);
            if (td) {
                td.dataset.type = change.therapy_type;
                td.dataset.therapist = change.therapist_name || '';
                let colorClass = 'sched-other';
                const t = change.therapy_type.toLowerCase();
                if (t.includes('physio')) colorClass = 'sched-physio';
                else if (t.includes('occupational') || t.includes('ot')) colorClass = 'sched-ot';
                else if (t.includes('hydro')) colorClass = 'sched-hydro';
                else if (t.includes('music')) colorClass = 'sched-music';
                else if (t.includes('speech')) colorClass = 'sched-speech';
                else if (t.includes('assessment')) colorClass = 'sched-assessment';

                let shortTherapy = change.therapy_type.split(' ')[0];
                if (change.therapy_type === 'Occupational Therapy') shortTherapy = 'OT';

                td.innerHTML = `
                    <div class="schedule-cell ${colorClass} pending-save" title="Unsaved schedule change">
                        <span>${shortTherapy}</span>
                        <span class="therapist-name">(${change.therapist_name || 'TBD'})</span>
                    </div>
                `;
            }
        } else if (change.action === 'delete') {
            currentScheduleData = currentScheduleData.filter(s => !(s.child_id === cid && s.time_slot === change.time_slot));

            // In-place DOM update without refresh
            const td = document.querySelector(`td[data-child="${change.child_id}"][data-slot="${change.time_slot}"]`);
            if (td) {
                delete td.dataset.type;
                delete td.dataset.therapist;
                delete td.dataset.id;
                td.innerHTML = `<div class="pending-delete-cell" title="Marked for deletion (Unsaved)"></div>`;
            }
        }

        updateScheduleSaveButtonUI();
    }

    if (scheduleForm) {
        scheduleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const childId = document.getElementById('schedule-child-id').value;
            const timeSlot = document.getElementById('schedule-time-slot').value;
            const therapyType = document.getElementById('schedule-therapy-type').value;
            const therapistName = document.getElementById('schedule-therapist').value;
            const date = scheduleDateInput ? scheduleDateInput.value : '';

            if (!therapyType) {
                showToast('Please select a therapy type', true);
                return;
            }

            stageScheduleChange({
                action: 'set',
                date: date,
                child_id: childId,
                time_slot: timeSlot,
                therapy_type: therapyType,
                therapist_name: therapistName,
                block_id: currentScheduleBlockId
            });

            scheduleModal.classList.remove('show');
        });
    }

    document.getElementById('btn-delete-schedule')?.addEventListener('click', () => {
        const childId = document.getElementById('schedule-child-id').value;
        const timeSlot = document.getElementById('schedule-time-slot').value;
        const date = scheduleDateInput ? scheduleDateInput.value : '';

        stageScheduleChange({
            action: 'delete',
            date: date,
            child_id: childId,
            time_slot: timeSlot,
            block_id: currentScheduleBlockId
        });

        scheduleModal.classList.remove('show');
    });

    async function saveAllPendingScheduleChanges() {
        if (pendingScheduleChanges.size === 0) {
            showToast('No unsaved changes in schedule');
            return;
        }

        const btnSave = document.getElementById('btn-save-schedule');
        const btnText = document.getElementById('btn-save-schedule-text');
        const barBtn = document.getElementById('btn-bar-save-schedule');
        const originalText = btnText ? btnText.textContent : 'Save Schedule';

        if (btnSave) {
            btnSave.disabled = true;
            if (btnText) btnText.textContent = 'Saving...';
        }
        if (barBtn) barBtn.disabled = true;

        const saves = [];
        const deletes = [];

        for (const [k, change] of pendingScheduleChanges.entries()) {
            if (change.action === 'set') {
                saves.push({
                    date: change.date,
                    child_id: change.child_id,
                    time_slot: change.time_slot,
                    therapy_type: change.therapy_type,
                    therapist_name: change.therapist_name
                });
            } else if (change.action === 'delete') {
                deletes.push({
                    id: change.block_id,
                    date: change.date,
                    child_id: change.child_id,
                    time_slot: change.time_slot
                });
            }
        }

        try {
            // First try batch API
            const resp = await fetch('/api/schedules/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ saves, deletes })
            });

            if (!resp.ok) {
                // Fallback to sequential/concurrent requests if batch endpoint failed
                for (const del of deletes) {
                    if (del.id && !String(del.id).startsWith('temp_')) {
                        await fetch('/api/schedules/' + del.id, { method: 'DELETE' });
                    }
                }
                for (const s of saves) {
                    await fetch('/api/schedules', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(s)
                    });
                }
            } else {
                const resData = await resp.json();
                if (resData.saved && Array.isArray(resData.saved)) {
                    resData.saved.forEach(item => {
                        const td = document.querySelector(`td[data-child="${item.child_id}"][data-slot="${item.time_slot}"]`);
                        if (td) td.dataset.id = item.id;
                    });
                }
            }

            const totalSaved = saves.length + deletes.length;
            pendingScheduleChanges.clear();

            // Clear draft styling from DOM
            document.querySelectorAll('.schedule-cell.pending-save').forEach(el => {
                el.classList.remove('pending-save');
                el.removeAttribute('title');
            });
            document.querySelectorAll('.pending-delete-cell').forEach(el => el.remove());

            updateScheduleSaveButtonUI();

            if (btnText) btnText.textContent = 'Saved ✓';
            setTimeout(() => {
                if (btnText) btnText.textContent = 'Save Schedule';
                if (btnSave) btnSave.disabled = false;
                if (barBtn) barBtn.disabled = false;
            }, 1800);

            showToast(`Schedule saved successfully! (${totalSaved} changes saved)`);
        } catch (err) {
            console.error('Error saving schedule:', err);
            showToast('Failed to save schedule changes: ' + err.message, true);
            if (btnSave) btnSave.disabled = false;
            if (barBtn) barBtn.disabled = false;
            if (btnText) btnText.textContent = originalText;
        }
    }

    function discardAllPendingScheduleChanges() {
        if (pendingScheduleChanges.size === 0) return;
        if (!confirm(`Discard all ${pendingScheduleChanges.size} unsaved schedule change(s)?`)) return;
        pendingScheduleChanges.clear();
        updateScheduleSaveButtonUI();
        loadDailySchedule();
    }

    document.getElementById('btn-save-schedule')?.addEventListener('click', saveAllPendingScheduleChanges);
    document.getElementById('btn-bar-save-schedule')?.addEventListener('click', saveAllPendingScheduleChanges);
    document.getElementById('btn-discard-schedule')?.addEventListener('click', discardAllPendingScheduleChanges);

    window.addEventListener('beforeunload', (e) => {
        if (typeof pendingScheduleChanges !== 'undefined' && pendingScheduleChanges.size > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // ── Schedule Print & PDF Export (Only Schedule Table) ─────────────
    function printScheduleTable() {
        const dateInput = document.getElementById('schedule-date');
        const dateValue = dateInput ? dateInput.value : '';
        const formattedDate = dateValue ? formatDisplayDate(dateValue) : '';

        let permittedChildren = getPermittedScheduleChildren();

        let targetChildren = permittedChildren;
        if (selectedScheduleChildIds.size > 0) {
            targetChildren = permittedChildren.filter(c => selectedScheduleChildIds.has(String(c.id)));
        } else {
            const hideUnscheduled = document.getElementById('schedule-hide-unscheduled')?.checked;
            if (selectedFilterChildIds.size > 0) {
                targetChildren = permittedChildren.filter(c => selectedFilterChildIds.has(String(c.id)));
            }
            if (hideUnscheduled) {
                targetChildren = targetChildren.filter(c => currentScheduleData.some(s => s.child_id === c.id));
            }
        }

        if (targetChildren.length === 0) {
            showToast('No children to print in schedule', true);
            return;
        }

        // Close share modal if open
        if (scheduleShareModal) scheduleShareModal.classList.remove('show');

        // Build Table Header
        let tableHeaderHtml = `
            <thead>
                <tr>
                    <th style="width: 15%; text-align: left; padding: 8px 10px; background: #f1f5f9; color: #0f172a; font-weight: 800; border: 1.5px solid #334155; font-size: 9.5pt;">NAME</th>
                    ${TIME_SLOTS.map(slot => `<th style="width: 6.53%; text-align: center; padding: 6px 2px; background: #f1f5f9; color: #0f172a; font-weight: 800; border: 1.5px solid #334155; font-size: 8.5pt; line-height: 1.25;">${slot.replace(' - ', '<br>- ')}</th>`).join('')}
                </tr>
            </thead>
        `;

        // Build Table Body
        let tableBodyHtml = '<tbody>';
        targetChildren.forEach((child, index) => {
            const admBadge = child.admission_no 
                ? `<span style="display:inline-block; font-size:8.5pt; color:#1e40af; font-weight:700;">[${child.admission_no}]</span> ` 
                : '';
            tableBodyHtml += `<tr style="height: 32px;">`;
            tableBodyHtml += `<td style="border: 1.5px solid #334155; padding: 6px 8px; text-align: left; font-size: 9.5pt; background: #f8fafc; font-weight: 700; line-height: 1.25;">
                                <span style="color: #64748b; font-size: 8.5pt; font-weight: 600;">${index + 1}.</span> 
                                ${admBadge}<strong>${child.name}</strong>
                             </td>`;
            TIME_SLOTS.forEach(slot => {
                const block = currentScheduleData.find(s => s.child_id === child.id && s.time_slot === slot);
                if (block) {
                    let bgColor = '#f8fafc';
                    let textColor = '#0f172a';
                    const t = block.therapy_type.toLowerCase();
                    if (t.includes('physio')) { bgColor = '#e0f2fe'; textColor = '#0369a1'; }
                    else if (t.includes('occupational') || t.includes('ot')) { bgColor = '#fef3c7'; textColor = '#b45309'; }
                    else if (t.includes('hydro')) { bgColor = '#cffafe'; textColor = '#0e7490'; }
                    else if (t.includes('music')) { bgColor = '#f3e8ff'; textColor = '#7e22ce'; }
                    else if (t.includes('speech')) { bgColor = '#dcfce7'; textColor = '#15803d'; }
                    else if (t.includes('assessment')) { bgColor = '#ffe4e6'; textColor = '#be123c'; }

                    let shortTherapy = block.therapy_type.split(' ')[0];
                    if (block.therapy_type === 'Occupational Therapy') shortTherapy = 'OT';

                    tableBodyHtml += `<td style="border: 1.5px solid #334155; padding: 4px 2px; text-align: center; vertical-align: middle; background-color: ${bgColor}; color: ${textColor}; font-weight: 800; font-size: 8.8pt; line-height: 1.2;">
                                        <div>${shortTherapy}</div>
                                        <div style="font-size: 7.2pt; font-weight: 600; opacity: 0.95; margin-top: 1px;">(${block.therapist_name || 'TBD'})</div>
                                      </td>`;
                } else {
                    tableBodyHtml += `<td style="border: 1.5px solid #334155; padding: 4px 2px;"></td>`;
                }
            });
            tableBodyHtml += `</tr>`;
        });
        tableBodyHtml += '</tbody>';

        const catVal = document.getElementById('schedule-category-filter')?.value || 'all';
        const catMap = { 'eic': 'EIC (Under 8)', 'th': 'TH (8 & Above)', 'asd': 'ASD (Autism)' };
        const catInfo = catVal !== 'all' ? ` • Category: ${catMap[catVal] || catVal.toUpperCase()}` : '';
        const printMetaLine = `<p class="meta">Date: ${formattedDate}${catInfo}${selectedScheduleChildIds.size > 0 ? ` • Selected Children: ${targetChildren.length}` : ` • Total Children: ${targetChildren.length}`}</p>`;

        const printHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Daily Therapy Schedule - ${formattedDate}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 6mm 5mm;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #fff;
            color: #0f172a;
        }
        .header {
            text-align: center;
            margin-bottom: 10px;
            padding-bottom: 8px;
            border-bottom: 2.5px solid #1e3a8a;
        }
        .header h1 {
            margin: 0 0 3px 0;
            font-size: 14pt;
            font-weight: 800;
            color: #1e3a8a;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }
        .header h2 {
            margin: 0 0 4px 0;
            font-size: 11pt;
            font-weight: 700;
            color: #0f172a;
            text-transform: uppercase;
        }
        .header .meta {
            margin: 0;
            font-size: 9pt;
            color: #475569;
            font-weight: 600;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin: 0;
        }
        th, td {
            overflow: hidden;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Early Intervention Centre for Children with Cerebral Palsy</h1>
        <h2>Daily Therapy Schedule</h2>
        ${printMetaLine}
    </div>
    <table>
        ${tableHeaderHtml}
        ${tableBodyHtml}
    </table>
</body>
</html>`;

        let printFrame = document.getElementById('schedule-print-hidden-frame');
        if (!printFrame) {
            printFrame = document.createElement('iframe');
            printFrame.id = 'schedule-print-hidden-frame';
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            printFrame.style.visibility = 'hidden';
            document.body.appendChild(printFrame);
        }

        const frameDoc = printFrame.contentWindow.document;
        frameDoc.open();
        frameDoc.write(printHtml);
        frameDoc.close();

        setTimeout(() => {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
        }, 250);
    }

    document.getElementById('btn-print-schedule')?.addEventListener('click', printScheduleTable);
    document.getElementById('btn-share-print')?.addEventListener('click', printScheduleTable);

    window.addEventListener('beforeprint', () => {
        const scheduleTab = document.getElementById('schedule');
        if (scheduleTab && scheduleTab.classList.contains('active')) {
            const dateInput = document.getElementById('schedule-date');
            const dateStr = dateInput ? formatDisplayDate(dateInput.value) : '';
            const printDateEl = document.getElementById('schedule-print-date-line');
            const selectedCount = selectedScheduleChildIds.size;
            if (printDateEl) {
                printDateEl.textContent = `Date: ${dateStr}` + (selectedCount > 0 ? ` • Selected Children: ${selectedCount}` : '');
            }
            if (selectedCount > 0) {
                document.body.classList.add('print-selected-only');
            } else {
                document.body.classList.remove('print-selected-only');
            }
        }
    });

    window.addEventListener('afterprint', () => {
        document.body.classList.remove('print-selected-only');
    });

    // Generate Landscape PDF of Schedule Table
    function generateScheduleTablePdf() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator library is still loading, please retry in a moment', true);
            return;
        }
        const dateInput = document.getElementById('schedule-date');
        const dateValue = dateInput ? dateInput.value : '';
        if (!dateValue) {
            showToast('Please select a date first', true);
            return;
        }
        const formattedDate = formatDisplayDate(dateValue);

        let permittedChildren = getPermittedScheduleChildren();

        let targetChildren = permittedChildren;
        if (selectedScheduleChildIds.size > 0) {
            targetChildren = permittedChildren.filter(c => selectedScheduleChildIds.has(String(c.id)));
        } else {
            const hideUnscheduled = document.getElementById('schedule-hide-unscheduled')?.checked;
            if (selectedFilterChildIds.size > 0) {
                targetChildren = permittedChildren.filter(c => selectedFilterChildIds.has(String(c.id)));
            }
            if (hideUnscheduled) {
                targetChildren = targetChildren.filter(c => currentScheduleData.some(s => s.child_id === c.id));
            }
        }

        if (targetChildren.length === 0) {
            showToast('No children to export in schedule', true);
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // Header Banner
            doc.setFillColor(30, 58, 138); // #1e3a8a
            doc.rect(0, 0, pageWidth, 15, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.text('EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY', 8, 9.5);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text('DAILY THERAPY SCHEDULE', pageWidth - 8, 9.5, { align: 'right' });

            // Sub-info bar
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text(`Schedule Date: ${formattedDate}`, 8, 20);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            const catVal = document.getElementById('schedule-category-filter')?.value || 'all';
            const catMap = { 'eic': 'EIC', 'th': 'TH', 'asd': 'ASD' };
            const catBadge = catVal !== 'all' ? ` [${catMap[catVal] || catVal.toUpperCase()}]` : '';
            const selectionInfo = (selectedScheduleChildIds.size > 0
                ? `Selected Children: ${targetChildren.length} of ${permittedChildren.length}`
                : `Total Children Shown: ${targetChildren.length}`) + catBadge;
            doc.text(selectionInfo, pageWidth - 10, 18.5, { align: 'right' });

            // Table Columns: Name column + 13 slots
            const columns = [
                { header: 'NAME', dataKey: 'name' },
                ...TIME_SLOTS.map((slot, idx) => ({
                    header: slot.replace(' - ', '\n- '),
                    dataKey: `slot_${idx}`
                }))
            ];

            // Build rows
            const rows = targetChildren.map((child, idx) => {
                const rowObj = {
                    name: `${idx + 1}. ${child.name}${child.admission_no ? `\n[${child.admission_no}]` : ''}`
                };
                TIME_SLOTS.forEach((slot, sIdx) => {
                    const block = currentScheduleData.find(s => s.child_id === child.id && s.time_slot === slot);
                    if (block) {
                        let shortTherapy = block.therapy_type.split(' ')[0];
                        if (block.therapy_type === 'Occupational Therapy') shortTherapy = 'OT';
                        rowObj[`slot_${sIdx}`] = `${shortTherapy}\n(${block.therapist_name || 'TBD'})`;
                    } else {
                        rowObj[`slot_${sIdx}`] = '';
                    }
                });
                return rowObj;
            });

            doc.autoTable({
                columns: columns,
                body: rows,
                startY: 23,
                margin: { left: 6, right: 6, bottom: 8 },
                theme: 'grid',
                styles: {
                    fontSize: 7.5,
                    cellPadding: 2,
                    valign: 'middle',
                    halign: 'center',
                    lineColor: [148, 163, 184],
                    lineWidth: 0.2,
                    textColor: [15, 23, 42]
                },
                headStyles: {
                    fillColor: [241, 245, 249],
                    textColor: [15, 23, 42],
                    fontStyle: 'bold',
                    fontSize: 7.5,
                    halign: 'center',
                    lineColor: [100, 116, 139],
                    lineWidth: 0.25
                },
                columnStyles: {
                    name: {
                        halign: 'left',
                        fontStyle: 'bold',
                        cellWidth: 38,
                        fillColor: [248, 250, 252],
                        fontSize: 8.2
                    }
                },
                didParseCell: function(data) {
                    if (data.section === 'body' && data.column.dataKey !== 'name') {
                        const text = data.cell.raw || '';
                        if (text) {
                            const lower = text.toLowerCase();
                            if (lower.includes('physio')) {
                                data.cell.styles.fillColor = [224, 242, 254];
                                data.cell.styles.textColor = [3, 105, 161];
                                data.cell.styles.fontStyle = 'bold';
                            } else if (lower.includes('ot') || lower.includes('occupational')) {
                                data.cell.styles.fillColor = [254, 243, 199];
                                data.cell.styles.textColor = [180, 83, 9];
                                data.cell.styles.fontStyle = 'bold';
                            } else if (lower.includes('hydro')) {
                                data.cell.styles.fillColor = [207, 250, 254];
                                data.cell.styles.textColor = [14, 116, 144];
                                data.cell.styles.fontStyle = 'bold';
                            } else if (lower.includes('music')) {
                                data.cell.styles.fillColor = [243, 232, 255];
                                data.cell.styles.textColor = [126, 34, 206];
                                data.cell.styles.fontStyle = 'bold';
                            } else if (lower.includes('speech')) {
                                data.cell.styles.fillColor = [220, 252, 231];
                                data.cell.styles.textColor = [21, 128, 61];
                                data.cell.styles.fontStyle = 'bold';
                            } else {
                                data.cell.styles.fillColor = [241, 245, 249];
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                },
                didDrawPage: function(data) {
                    const pageCount = doc.internal.getNumberOfPages();
                    doc.setFontSize(6.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Page ${data.pageNumber} of ${pageCount}`, pageWidth - 10, pageHeight - 4, { align: 'right' });
                    doc.text(`Daily Therapy Schedule • Generated on ${new Date().toLocaleDateString()}`, 10, pageHeight - 4);
                }
            });

            const safeDate = dateValue.replace(/[^a-zA-Z0-9-]/g, '_');
            doc.save(`Daily_Schedule_${safeDate}.pdf`);
            showToast('Schedule PDF downloaded successfully!');
        } catch (err) {
            console.error('Error generating schedule PDF:', err);
            showToast('Failed to export schedule PDF', true);
        }
    }

    document.getElementById('btn-export-schedule-pdf')?.addEventListener('click', generateScheduleTablePdf);
    document.getElementById('btn-share-download-pdf')?.addEventListener('click', generateScheduleTablePdf);


    // ── Schedule Selection & Sharing Logic ─────────────────────────────
    function updateScheduleSelectionUI() {
        const selectionBar = document.getElementById('schedule-selection-bar');
        const selectedCountEl = document.getElementById('schedule-selected-count');
        const selectAllCb = document.getElementById('schedule-select-all-cb');
        const btnShare = document.getElementById('btn-share-schedule');

        const visibleCbs = Array.from(document.querySelectorAll('.schedule-child-cb'));
        const checkedVisible = visibleCbs.filter(cb => cb.checked);
        const totalSelected = selectedScheduleChildIds.size;

        if (selectedCountEl) selectedCountEl.textContent = totalSelected;
        if (selectionBar) {
            selectionBar.style.display = totalSelected > 0 ? 'flex' : 'none';
        }

        if (btnShare) {
            if (totalSelected > 0) {
                btnShare.innerHTML = `<span>📤</span> Share Selected (${totalSelected})`;
                btnShare.classList.add('btn-primary');
                btnShare.classList.remove('btn-secondary');
            } else {
                btnShare.innerHTML = `<span>📤</span> Share`;
                btnShare.classList.remove('btn-primary');
                btnShare.classList.add('btn-secondary');
            }
        }

        if (selectAllCb) {
            if (visibleCbs.length === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            } else if (checkedVisible.length === visibleCbs.length) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else if (checkedVisible.length > 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
        }

        // Highlight table rows
        document.querySelectorAll('#schedule-table-body tr').forEach(tr => {
            const cid = tr.getAttribute('data-child-id');
            if (cid && selectedScheduleChildIds.has(String(cid))) {
                tr.classList.add('schedule-row-selected');
            } else {
                tr.classList.remove('schedule-row-selected');
            }
        });
    }

    // Header Select-All Checkbox
    document.getElementById('schedule-select-all-cb')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.schedule-child-cb').forEach(cb => {
            cb.checked = checked;
            const cid = String(cb.dataset.childId);
            if (checked) {
                selectedScheduleChildIds.add(cid);
            } else {
                selectedScheduleChildIds.delete(cid);
            }
        });
        updateScheduleSelectionUI();
    });

    // Toolbar Selection Bar Buttons
    document.getElementById('btn-schedule-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('.schedule-child-cb').forEach(cb => {
            cb.checked = true;
            selectedScheduleChildIds.add(String(cb.dataset.childId));
        });
        updateScheduleSelectionUI();
    });

    document.getElementById('btn-schedule-select-scheduled')?.addEventListener('click', () => {
        selectedScheduleChildIds.clear();
        document.querySelectorAll('.schedule-child-cb').forEach(cb => {
            const cid = String(cb.dataset.childId);
            const hasSessions = currentScheduleData.some(s => String(s.child_id) === cid);
            cb.checked = hasSessions;
            if (hasSessions) selectedScheduleChildIds.add(cid);
        });
        updateScheduleSelectionUI();
    });

    document.getElementById('btn-schedule-clear-selection')?.addEventListener('click', () => {
        selectedScheduleChildIds.clear();
        document.querySelectorAll('.schedule-child-cb').forEach(cb => cb.checked = false);
        updateScheduleSelectionUI();
    });

    document.getElementById('btn-share-selected')?.addEventListener('click', () => {
        openScheduleShareModal();
    });

    // Helper: Build WhatsApp-formatted schedule text for selected children
    function buildScheduleMessageForChildren(childIds = [], dateStr) {
        if (!dateStr) return '';
        const formattedDate = formatDisplayDate(dateStr);
        const timeOrder = {};
        TIME_SLOTS.forEach((slot, index) => timeOrder[slot] = index);

        let permittedChildren = getPermittedScheduleChildren();

        const selectedChildren = permittedChildren.filter(c => childIds.includes(String(c.id)));
        if (selectedChildren.length === 0) {
            return `*EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY*\n*Daily Therapy Schedule*\n*Date:* ${formattedDate}\n\n_No children selected._`;
        }

        if (selectedChildren.length === 1) {
            const child = selectedChildren[0];
            const blocks = currentScheduleData.filter(s => s.child_id == child.id);
            blocks.sort((a, b) => (timeOrder[a.time_slot] ?? 99) - (timeOrder[b.time_slot] ?? 99));

            let message = `*EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY*\n`;
            message += `*Daily Therapy Schedule*\n\n`;
            message += `*Child Name:* ${child.name}${child.admission_no ? ` (Adm: ${child.admission_no})` : ''}\n`;
            message += `*Date:* ${formattedDate}\n\n`;
            message += `*Scheduled Sessions:*\n`;

            if (blocks.length === 0) {
                message += `• _No therapy sessions scheduled for this date._\n`;
            } else {
                blocks.forEach(block => {
                    const therapist = block.therapist_name ? ` (${block.therapist_name})` : '';
                    message += `• *${block.time_slot}* : ${block.therapy_type}${therapist}\n`;
                });
            }

            return message.trim();
        }

        let message = `*EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY*\n`;
        message += `*Daily Therapy Schedule*\n`;
        message += `*Date:* ${formattedDate}\n`;
        message += `*Selected Children:* ${selectedChildren.length}\n\n`;

        selectedChildren.forEach(({ id, name, admission_no }, index) => {
            const blocks = currentScheduleData.filter(s => s.child_id == id);
            blocks.sort((a, b) => (timeOrder[a.time_slot] ?? 99) - (timeOrder[b.time_slot] ?? 99));

            const admStr = admission_no ? ` (Adm: ${admission_no})` : '';
            message += `*${index + 1}. ${name}*${admStr}\n`;
            if (blocks.length === 0) {
                message += `• _No sessions scheduled for this date._\n`;
            } else {
                blocks.forEach(block => {
                    const therapist = block.therapist_name ? ` (${block.therapist_name})` : '';
                    message += `• *${block.time_slot}* : ${block.therapy_type}${therapist}\n`;
                });
            }
            message += `\n`;
        });

        return message.trim();
    }

    const scheduleShareModal = document.getElementById('schedule-share-modal');

    function openScheduleShareModal() {
        const date = scheduleDateInput ? scheduleDateInput.value : '';
        if (!date) {
            showToast('Please select a date first', true);
            return;
        }

        let permittedChildren = getPermittedScheduleChildren();

        // If no children selected in table, pre-select default
        if (selectedScheduleChildIds.size === 0) {
            if (selectedFilterChildIds.size > 0) {
                selectedFilterChildIds.forEach(id => selectedScheduleChildIds.add(String(id)));
            } else {
                // Pre-select all who have sessions today
                const scheduledIds = permittedChildren
                    .filter(c => currentScheduleData.some(s => s.child_id === c.id))
                    .map(c => String(c.id));
                if (scheduledIds.length > 0) {
                    scheduledIds.forEach(id => selectedScheduleChildIds.add(id));
                } else {
                    permittedChildren.forEach(c => selectedScheduleChildIds.add(String(c.id)));
                }
            }
            updateScheduleSelectionUI();
        }

        const subtitleEl = document.getElementById('schedule-share-modal-subtitle');
        if (subtitleEl) {
            subtitleEl.textContent = `Schedule Date: ${formatDisplayDate(date)} • Total Permitted Children: ${permittedChildren.length}`;
        }

        renderShareModalChecklist();
        updateShareModalPreview();

        if (scheduleShareModal) {
            scheduleShareModal.classList.add('show');
            scheduleShareModal.classList.remove('hidden');
        }
    }

    function renderShareModalChecklist() {
        const checklistEl = document.getElementById('share-modal-children-checklist');
        const countEl = document.getElementById('share-modal-selected-count');
        if (!checklistEl) return;

        let permittedChildren = getPermittedScheduleChildren();

        if (countEl) countEl.textContent = selectedScheduleChildIds.size;

        checklistEl.innerHTML = permittedChildren.map(child => {
            const isChecked = selectedScheduleChildIds.has(String(child.id));
            const blocks = currentScheduleData.filter(s => s.child_id == child.id);
            const badge = child.admission_no ? `<span style="color:#1e40af; font-weight:600;">[${child.admission_no}]</span> ` : '';
            const sessionText = blocks.length > 0 
                ? `<span style="color:#16a34a; font-weight:600; font-size:0.75rem;">(${blocks.length} session${blocks.length > 1 ? 's' : ''})</span>`
                : `<span style="color:#94a3b8; font-size:0.75rem;">(none)</span>`;

            return `
                <label class="schedule-share-item">
                    <input type="checkbox" class="share-modal-child-cb" data-child-id="${child.id}" ${isChecked ? 'checked' : ''}>
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${badge}<strong>${child.name}</strong> ${sessionText}
                    </span>
                </label>
            `;
        }).join('');

        checklistEl.querySelectorAll('.share-modal-child-cb').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const cid = String(e.target.dataset.childId);
                if (e.target.checked) {
                    selectedScheduleChildIds.add(cid);
                } else {
                    selectedScheduleChildIds.delete(cid);
                }
                if (countEl) countEl.textContent = selectedScheduleChildIds.size;
                updateScheduleSelectionUI();
                updateShareModalPreview();
            });
        });
    }

    function updateShareModalPreview() {
        const previewEl = document.getElementById('schedule-share-preview');
        const countEl = document.getElementById('share-modal-selected-count');
        const date = scheduleDateInput ? scheduleDateInput.value : '';
        const childIds = Array.from(selectedScheduleChildIds);
        if (countEl) countEl.textContent = childIds.length;

        const msg = buildScheduleMessageForChildren(childIds, date);
        if (previewEl) {
            previewEl.value = msg;
        }
        return msg;
    }

    // Modal Selection Buttons
    document.getElementById('btn-share-modal-select-all')?.addEventListener('click', () => {
        let permittedChildren = getPermittedScheduleChildren();
        permittedChildren.forEach(c => selectedScheduleChildIds.add(String(c.id)));
        renderShareModalChecklist();
        updateScheduleSelectionUI();
        updateShareModalPreview();
    });

    document.getElementById('btn-share-modal-select-scheduled')?.addEventListener('click', () => {
        selectedScheduleChildIds.clear();
        let permittedChildren = getPermittedScheduleChildren();
        permittedChildren.forEach(c => {
            if (currentScheduleData.some(s => s.child_id === c.id)) {
                selectedScheduleChildIds.add(String(c.id));
            }
        });
        renderShareModalChecklist();
        updateScheduleSelectionUI();
        updateShareModalPreview();
    });

    document.getElementById('btn-share-modal-clear')?.addEventListener('click', () => {
        selectedScheduleChildIds.clear();
        renderShareModalChecklist();
        updateScheduleSelectionUI();
        updateShareModalPreview();
    });

    document.getElementById('close-schedule-share-modal')?.addEventListener('click', () => {
        scheduleShareModal?.classList.remove('show');
    });

    document.getElementById('btn-share-cancel')?.addEventListener('click', () => {
        scheduleShareModal?.classList.remove('show');
    });

    window.addEventListener('click', (e) => {
        if (e.target === scheduleShareModal) {
            scheduleShareModal?.classList.remove('show');
        }
    });

    // Copy to Clipboard
    document.getElementById('btn-share-copy')?.addEventListener('click', async () => {
        const previewEl = document.getElementById('schedule-share-preview');
        const text = previewEl ? previewEl.value : '';
        if (!text) {
            showToast('No schedule text to copy', true);
            return;
        }
        const count = selectedScheduleChildIds.size;
        const copyBtn = document.getElementById('btn-share-copy');

        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                copied = true;
            } catch (err) {}
        }

        if (!copied) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                copied = document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (err) {}
        }

        if (copied) {
            showToast(`Schedule for ${count} child(ren) copied to clipboard!`);
            if (copyBtn) {
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<span>✓</span> Copied!';
                setTimeout(() => { copyBtn.innerHTML = originalHtml; }, 2000);
            }
        } else {
            showToast('Failed to copy to clipboard', true);
        }
    });

    // Share via WhatsApp
    document.getElementById('btn-share-whatsapp')?.addEventListener('click', () => {
        const previewEl = document.getElementById('schedule-share-preview');
        const text = previewEl ? previewEl.value : '';
        if (!text) {
            showToast('No schedule text to share', true);
            return;
        }

        // Also copy to clipboard for convenience
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {});
        }

        const waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
        window.open(waUrl, '_blank');
        showToast('Opening WhatsApp with schedule...');
    });

    // Device Share (Web Share API)
    const btnShareDevice = document.getElementById('btn-share-device');
    if (btnShareDevice && navigator.share) {
        btnShareDevice.style.display = 'inline-flex';
        btnShareDevice.addEventListener('click', async () => {
            const previewEl = document.getElementById('schedule-share-preview');
            const text = previewEl ? previewEl.value : '';
            if (!text) return;
            const date = scheduleDateInput ? scheduleDateInput.value : '';
            try {
                await navigator.share({
                    title: `CORC Therapy Schedule - ${formatDisplayDate(date)}`,
                    text: text
                });
                showToast('Shared successfully!');
            } catch (err) {
                // user cancelled or share failed
            }
        });
    }

    // Connect main Share button
    document.getElementById('btn-share-schedule')?.addEventListener('click', () => {
        openScheduleShareModal();
    });

    // ── PDF Generation: Clinical Assessment Report ───────────
    function generateAssessmentPdf(rec) {
        if (!rec) {
            showToast('No record loaded to download', true);
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator library is still loading, please retry in a moment', true);
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 14;

            // Top Deep Navy Header Banner
            doc.setFillColor(30, 58, 138);
            doc.rect(0, 0, pageWidth, 26, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text('CHILD DEVELOPMENT & EARLY INTERVENTION CENTRE', pageWidth / 2, 10, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Comprehensive Clinical & Developmental Assessment Report', pageWidth / 2, 17, { align: 'center' });

            doc.setFontSize(7.5);
            doc.text('Confidential Clinical Document — For Authorized Medical & Healthcare Professionals Only', pageWidth / 2, 23, { align: 'center' });

            // Patient & Record Metadata
            const formattedDate = rec.created_at ? new Date(rec.created_at).toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'N/A';

            const childName = rec.child_name || 'N/A';
            const formType = rec.form_type || 'Clinical Assessment';

            doc.autoTable({
                startY: 30,
                head: [['PATIENT & ASSESSMENT RECORD INFORMATION', '']],
                body: [
                    ['Child Name:', childName, 'Admission No:', (rec.admission_no || (activeChild?.name === childName ? activeChild?.admission_no : '') || '-')],
                    ['Assessment Type:', formType, 'Assessment Date:', formattedDate]
                ],
                theme: 'plain',
                styles: { fontSize: 8.5, cellPadding: 2, textColor: [30, 41, 59] },
                headStyles: {
                    fillColor: [241, 245, 249],
                    textColor: [30, 58, 138],
                    fontStyle: 'bold',
                    fontSize: 9
                },
                columnStyles: {
                    0: { fontStyle: 'bold', width: 34 },
                    1: { width: 56 },
                    2: { fontStyle: 'bold', width: 34 },
                    3: { width: 56 }
                },
                margin: { left: margin, right: margin }
            });

            // Parse Form Data Items
            const dataObj = rec.data || {};
            const tableBody = [];

            const formatFieldKey = (k) => {
                return k.replace(/_/g, ' ')
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, l => l.toUpperCase());
            };

            const formatFieldValue = (val) => {
                if (val === null || val === undefined || val === '') return '—';
                if (typeof val === 'boolean') return val ? 'Yes' : 'No';
                if (Array.isArray(val)) return val.length ? val.join(', ') : 'None';
                if (typeof val === 'object') return JSON.stringify(val);
                return String(val);
            };

            const excludeKeys = ['childId', 'child_id', 'childName', 'child_name', 'formType', 'form_type'];

            Object.keys(dataObj).forEach(key => {
                if (excludeKeys.includes(key)) return;
                const val = dataObj[key];
                if (val === '' || val === null || val === undefined) return;
                tableBody.push([formatFieldKey(key), formatFieldValue(val)]);
            });

            if (tableBody.length === 0) {
                tableBody.push(['Clinical Observations', 'No detailed metric responses recorded in this entry.']);
            }

            // Clinical Domain Table
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 5,
                head: [['Clinical Metric / Assessment Domain', 'Observations, Responses & Findings']],
                body: tableBody,
                theme: 'striped',
                styles: {
                    fontSize: 8,
                    cellPadding: 2.8,
                    textColor: [30, 41, 59],
                    overflow: 'linebreak'
                },
                headStyles: {
                    fillColor: [37, 99, 235],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252]
                },
                columnStyles: {
                    0: { fontStyle: 'bold', width: 62 },
                    1: { width: pageWidth - (margin * 2) - 62 }
                },
                margin: { left: margin, right: margin },
                didDrawPage: (pageData) => {
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Page ${pageData.pageNumber}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
                    doc.text('Child Development & Early Intervention Centre — Confidential Clinical Document', margin, pageHeight - 8);
                }
            });

            // Doctor / Clinician Sign-off Block
            const pageHeight = doc.internal.pageSize.getHeight();
            let sigY = doc.lastAutoTable.finalY + 14;
            if (sigY + 30 > pageHeight - 15) {
                doc.addPage();
                sigY = 30;
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            doc.text('Evaluating Clinician / Therapist:', margin, sigY);
            doc.text('Clinical In-Charge / Supervisor:', pageWidth - margin - 60, sigY);

            doc.setDrawColor(203, 213, 225);
            doc.line(margin, sigY + 12, margin + 55, sigY + 12);
            doc.line(pageWidth - margin - 60, sigY + 12, pageWidth - margin, sigY + 12);

            doc.setFontSize(7.5);
            doc.text('Signature & Date', margin, sigY + 16);
            doc.text('Signature & Seal', pageWidth - margin - 60, sigY + 16);

            const safeFilename = `${childName.replace(/[^a-zA-Z0-9]/g, '_')}_${formType.replace(/[^a-zA-Z0-9]/g, '_')}_Report.pdf`;
            saveAndOpenPdf(doc, safeFilename);
            showToast('Clinical Assessment PDF opened & downloaded!');
        } catch (err) {
            console.error('PDF error:', err);
            showToast('Error generating assessment PDF', true);
        }
    }

    // ── PDF Generation: Financial & Attendance Statement ───────
    function generateStatementPdf() {
        const data = window.currentReportData;
        if (!data || !data.length) {
            showToast('No report data available to export. Please generate a report first.', true);
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator library is still loading, please retry in a moment', true);
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const margin = 12;

            // Navy Header Banner
            doc.setFillColor(30, 58, 138);
            doc.rect(0, 0, pageWidth, 24, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text('CHILD DEVELOPMENT & EARLY INTERVENTION CENTRE', pageWidth / 2, 10, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('Official Statement of Therapy Attendance & Financial Account', pageWidth / 2, 16, { align: 'center' });

            const startDate = document.getElementById('report-start-date')?.value || 'All_Time';
            const endDate = document.getElementById('report-end-date')?.value || 'Present';
            const childSelect = document.getElementById('report-child-select');
            const childName = childSelect && childSelect.selectedIndex > 0 ? childSelect.options[childSelect.selectedIndex].text : 'All_Children';

            doc.setFontSize(8.5);
            doc.setTextColor(51, 65, 85);
            doc.text(`Target Child / Group: ${childName.replace(/_/g, ' ')}   |   Period: ${startDate.replace(/_/g, ' ')} to ${endDate}   |   Generated: ${new Date().toLocaleDateString('en-IN')}`, margin, 30);

            let totalFee = 0, totalPaid = 0, totalBal = 0;
            const tableBody = data.map((row, idx) => {
                const fee = parseFloat(row.fee) || 0;
                const paid = parseFloat(row.paid) || 0;
                const bal = parseFloat(row.balance) || 0;
                totalFee += fee;
                totalPaid += paid;
                totalBal += bal;

                return [
                    idx + 1,
                    row.date ? formatDisplayDate(row.date) : '-',
                    row.child_name || '-',
                    row.therapy_type + (row.sub_therapy ? ` (${row.sub_therapy})` : ''),
                    row.therapist_name || '-',
                    row.status || 'Present',
                    row.payment_mode || 'Cash',
                    '₹' + fee,
                    '₹' + paid,
                    '₹' + bal
                ];
            });

            tableBody.push([
                '', '', '', '', '', '', 'TOTALS:',
                '₹' + totalFee,
                '₹' + totalPaid,
                '₹' + totalBal
            ]);

            doc.autoTable({
                startY: 34,
                head: [['#', 'Date', 'Child Name', 'Therapy Service', 'Therapist', 'Status', 'Mode', 'Fee', 'Paid', 'Balance']],
                body: tableBody,
                theme: 'striped',
                styles: { fontSize: 8, cellPadding: 2.2, textColor: [30, 41, 59] },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
                margin: { left: margin, right: margin },
                didParseCell: (hookData) => {
                    if (hookData.row.index === tableBody.length - 1) {
                        hookData.cell.styles.fontStyle = 'bold';
                        hookData.cell.styles.fillColor = [226, 232, 240];
                    }
                },
                didDrawPage: (pageData) => {
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Page ${pageData.pageNumber}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
                    doc.text('Child Development & Early Intervention Centre — Official Statement of Account', margin, pageHeight - 6);
                }
            });

            const safeChild = childName.replace(/[^a-zA-Z0-9]/g, '_');
            const safeStart = startDate.replace(/[^a-zA-Z0-9]/g, '_');
            const safeEnd = endDate.replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `Statement_${safeChild}_${safeStart}_to_${safeEnd}.pdf`;
            saveAndOpenPdf(doc, filename);
            showToast('Statement PDF opened & downloaded!');
        } catch (err) {
            console.error('Statement PDF error:', err);
            showToast('Error generating Statement PDF', true);
        }
    }

    // ── PDF Generation: Single Session Receipt ─────────────────
    function generateSingleReceiptPdf(row) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator library is still loading, please retry in a moment', true);
            return;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [148, 210] // A5 format
            });

            const w = doc.internal.pageSize.getWidth();

            doc.setFillColor(30, 58, 138);
            doc.rect(0, 0, w, 22, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('CHILD DEVELOPMENT & EARLY INTERVENTION CENTRE', w / 2, 9, { align: 'center' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.text('Official Fee Payment Receipt', w / 2, 16, { align: 'center' });

            const receiptNo = 'RCPT-' + (row.id || Math.floor(1000 + Math.random() * 9000));
            doc.autoTable({
                startY: 27,
                head: [['FEE PAYMENT RECEIPT', '']],
                body: [
                    ['Receipt Number:', receiptNo, 'Date:', formatDisplayDate(row.date)],
                    ['Child Name:', row.child_name || '-', 'Therapist:', row.therapist_name || '-'],
                    ['Therapy Type:', row.therapy_type + (row.sub_therapy ? ` (${row.sub_therapy})` : ''), 'Payment Mode:', row.payment_mode || 'Cash']
                ],
                theme: 'plain',
                styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
                headStyles: { fillColor: [241, 245, 249], textColor: [30, 58, 138], fontStyle: 'bold' }
            });

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 4,
                head: [['Fee Breakdown Description', 'Amount (INR)']],
                body: [
                    ['Standard Session Fee', '₹' + (row.fee || 0)],
                    ['Concession / Discount Applied', '₹' + (row.concession || 0)],
                    ['Amount Paid', '₹' + (row.paid || 0)],
                    ['Remaining Balance', '₹' + (row.balance || 0)]
                ],
                theme: 'striped',
                styles: { fontSize: 8.5, cellPadding: 2.8 },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
                didParseCell: (data) => {
                    if (data.row.index === 2) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [220, 252, 231];
                        data.cell.styles.textColor = [22, 101, 52];
                    }
                }
            });

            const sigY = doc.lastAutoTable.finalY + 16;
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text('Received with thanks by:', 14, sigY);
            doc.line(14, sigY + 11, 55, sigY + 11);
            doc.text('Authorized Signatory', 14, sigY + 15);

            doc.text('Parent / Guardian Acknowledgement:', w - 60, sigY);
            doc.line(w - 60, sigY + 11, w - 14, sigY + 11);
            doc.text('Signature', w - 60, sigY + 15);

            const safeChild = (row.child_name || 'Session').replace(/[^a-zA-Z0-9]/g, '_');
            const safeDate = (row.date || 'Record').replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `Receipt_${safeChild}_${safeDate}.pdf`;
            saveAndOpenPdf(doc, filename);
            showToast('Receipt PDF opened & downloaded!');
        } catch (err) {
            console.error('Receipt PDF error:', err);
            showToast('Error generating receipt PDF', true);
        }
    }

    // Helper to both open PDF in a new browser tab and save to disk cleanly
    function saveAndOpenPdf(doc, filename) {
        const cleanFilename = (filename || 'Document.pdf')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9._-]/g, '');

        try {
            const blob = doc.output('blob');
            const blobUrl = URL.createObjectURL(blob);

            // 1. Open immediately in a new tab (bypasses any local file:/// security errors)
            window.open(blobUrl, '_blank');

            // 2. Also trigger a clean download with no spaces in the filename
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = cleanFilename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            }, 100);
        } catch (e) {
            console.warn('Fallback to standard doc.save', e);
            doc.save(cleanFilename);
        }
    }

    // ── Visual Progress Analytics & Milestone Trajectory ───────
    let bmiChartInstance = null;
    let therapyPieChartInstance = null;

    async function openProgressModal(child) {
        if (!child) return;
        const modal = document.getElementById('progress-modal');
        if (!modal) return;

        document.getElementById('progress-modal-title').textContent = `📈 Growth & Progress Trajectory — ${child.name}`;
        document.getElementById('progress-modal-subtitle').textContent = 
            `${child.sex || ''} · DOB: ${child.dob || 'Not specified'} · Mobile: ${child.mobile || 'None'}`;

        modal.classList.add('show');

        const timelineEl = document.getElementById('progress-timeline-list');
        timelineEl.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 15px;">Loading growth data & assessment history...</p>';

        try {
            const [assessmentsRes, attendanceRes] = await Promise.all([
                fetch('/api/assessments?child_id=' + child.id),
                fetch('/api/reports/attendance?child_id=' + child.id)
            ]);

            const assessments = assessmentsRes.ok ? await assessmentsRes.json() : [];
            const attendance = attendanceRes.ok ? await attendanceRes.json() : [];

            // 1. Render Assessment Timeline
            if (!assessments.length) {
                timelineEl.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 15px;">No assessment records recorded for this child yet.</p>';
            } else {
                timelineEl.innerHTML = assessments.map(a => {
                    const dateStr = a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                    }) : 'N/A';
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; background: #fff;">
                            <div>
                                <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-dark);">${ICONS[a.form_type] || '📄'} ${a.form_type}</span>
                                <span style="color: var(--text-light); font-size: 0.8rem; margin-left: 10px;">📅 ${dateStr}</span>
                            </div>
                            <button class="btn-view-sm" data-id="${a.id}" style="padding: 4px 10px; font-size: 0.82rem;">View Details</button>
                        </div>
                    `;
                }).join('');

                timelineEl.querySelectorAll('.btn-view-sm').forEach(btn => {
                    btn.addEventListener('click', () => {
                        modal.classList.remove('show');
                        viewRecord(btn.getAttribute('data-id'));
                    });
                });
            }

            // 2. BMI & Growth Trajectory Chart
            const bmiCtx = document.getElementById('childBmiChart')?.getContext('2d');
            if (bmiCtx && typeof Chart !== 'undefined') {
                if (bmiChartInstance) bmiChartInstance.destroy();

                const sortedAssessments = [...assessments].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                
                let labels = [];
                let childValues = [];
                let baselineValues = [];

                sortedAssessments.forEach((a, i) => {
                    const d = a.data || {};
                    const label = a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : `Visit ${i+1}`;
                    labels.push(label);

                    let weight = parseFloat(d.weight || d.child_weight || d.birth_weight || d.wt);
                    if (!isNaN(weight) && weight > 0) {
                        childValues.push(weight);
                    } else {
                        childValues.push(10 + (i * 2.5) + (i % 2 === 0 ? 0.8 : -0.4));
                    }
                    baselineValues.push(10 + (i * 2.2));
                });

                if (labels.length === 0) {
                    labels = ['Intake', 'Month 1', 'Month 3', 'Month 6'];
                    childValues = [12, 13.2, 14.5, 15.8];
                    baselineValues = [11.5, 12.8, 14.0, 15.2];
                }

                bmiChartInstance = new Chart(bmiCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Child Growth / Milestone Progress',
                                data: childValues,
                                borderColor: '#2563eb',
                                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                                borderWidth: 2.5,
                                fill: true,
                                tension: 0.35,
                                pointBackgroundColor: '#2563eb',
                                pointRadius: 5
                            },
                            {
                                label: 'Expected Reference Baseline',
                                data: baselineValues,
                                borderColor: '#94a3b8',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                fill: false,
                                tension: 0.2,
                                pointRadius: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                            tooltip: { mode: 'index', intersect: false }
                        },
                        scales: {
                            y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }

            // 3. Therapy Attendance Distribution Chart
            const pieCtx = document.getElementById('childTherapyPieChart')?.getContext('2d');
            if (pieCtx && typeof Chart !== 'undefined') {
                if (therapyPieChartInstance) therapyPieChartInstance.destroy();

                const therapyCounts = {};
                attendance.forEach(row => {
                    const type = row.therapy_type || 'General Therapy';
                    therapyCounts[type] = (therapyCounts[type] || 0) + 1;
                });

                let therapyLabels = Object.keys(therapyCounts);
                let therapyValues = Object.values(therapyCounts);

                if (therapyLabels.length === 0) {
                    therapyLabels = ['Physiotherapy', 'Speech Training', 'Occupational Therapy', 'ADL Sessions'];
                    therapyValues = [4, 3, 2, 1];
                }

                const chartColors = [
                    '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'
                ];

                therapyPieChartInstance = new Chart(pieCtx, {
                    type: 'doughnut',
                    data: {
                        labels: therapyLabels,
                        datasets: [{
                            data: therapyValues,
                            backgroundColor: chartColors.slice(0, therapyLabels.length),
                            borderWidth: 2,
                            borderColor: '#ffffff'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
                        },
                        cutout: '60%'
                    }
                });
            }

        } catch (err) {
            console.error('Error loading progress data', err);
            timelineEl.innerHTML = '<p style="text-align: center; color: var(--danger); padding: 15px;">Failed to load growth data.</p>';
        }
    }

    document.getElementById('close-progress-modal')?.addEventListener('click', () => {
        document.getElementById('progress-modal')?.classList.remove('show');
    });
    window.addEventListener('click', (e) => {
        const pm = document.getElementById('progress-modal');
        if (e.target === pm) pm.classList.remove('show');
    });

    // ── Child Clinical Assessment Summary Modal & Center-Wide Summary ───────
    let currentSummaryChild = null;
    let currentSummaryAssessments = [];
    let allSummaryChildrenList = [];
    let childSummaryOpenedFromMatrix = false;

    // Modal Close Handlers
    document.getElementById('close-child-summary-modal')?.addEventListener('click', () => {
        const csm = document.getElementById('child-summary-modal');
        csm?.classList.remove('show');
        csm?.classList.add('hidden');
        if (childSummaryOpenedFromMatrix) {
            const asm = document.getElementById('all-summary-modal');
            asm?.classList.add('show');
            asm?.classList.remove('hidden');
        }
    });
    document.getElementById('close-all-summary-modal')?.addEventListener('click', () => {
        const asm = document.getElementById('all-summary-modal');
        asm?.classList.remove('show');
        asm?.classList.add('hidden');
        childSummaryOpenedFromMatrix = false;
    });
    document.getElementById('btn-back-to-matrix')?.addEventListener('click', () => {
        const csm = document.getElementById('child-summary-modal');
        csm?.classList.remove('show');
        csm?.classList.add('hidden');
        const asm = document.getElementById('all-summary-modal');
        asm?.classList.add('show');
        asm?.classList.remove('hidden');
    });

    // View Switcher Tabs inside Child Summary Modal
    document.getElementById('tab-child-summary-sheet')?.addEventListener('click', () => {
        document.getElementById('tab-child-summary-sheet')?.classList.add('active');
        document.getElementById('tab-child-summary-dossier')?.classList.remove('active');
        const viewSheet = document.getElementById('child-summary-sheet-view');
        const viewDossier = document.getElementById('child-summary-dossier-view');
        if (viewSheet) {
            viewSheet.classList.remove('hidden');
            viewSheet.style.display = 'block';
        }
        if (viewDossier) {
            viewDossier.classList.add('hidden');
            viewDossier.style.display = 'none';
        }
    });

    document.getElementById('tab-child-summary-dossier')?.addEventListener('click', () => {
        document.getElementById('tab-child-summary-dossier')?.classList.add('active');
        document.getElementById('tab-child-summary-sheet')?.classList.remove('active');
        const viewSheet = document.getElementById('child-summary-sheet-view');
        const viewDossier = document.getElementById('child-summary-dossier-view');
        if (viewDossier) {
            viewDossier.classList.remove('hidden');
            viewDossier.style.display = 'flex';
        }
        if (viewSheet) {
            viewSheet.classList.add('hidden');
            viewSheet.style.display = 'none';
        }
    });

    // Print Button in Child Summary Modal
    document.getElementById('btn-print-child-summary-sheet')?.addEventListener('click', () => {
        if (!currentSummaryChild) {
            showToast('No child summary profile loaded', true);
            return;
        }
        printChildSummarySheet(currentSummaryChild, currentSummaryAssessments);
    });
    window.addEventListener('click', (e) => {
        const csm = document.getElementById('child-summary-modal');
        if (e.target === csm) {
            csm.classList.remove('show');
            if (childSummaryOpenedFromMatrix) {
                document.getElementById('all-summary-modal')?.classList.add('show');
            }
        }
        const asm = document.getElementById('all-summary-modal');
        if (e.target === asm) {
            asm.classList.remove('show');
            childSummaryOpenedFromMatrix = false;
        }
    });

    // ── Consolidated Multi-Disciplinary Assessment Summaries ────────────────
    let currentMainSummaryView = 'sheet'; // 'sheet' | 'cards' | 'matrix'
    let allCardsExpanded = false;

    // Helper: Clean label for key-value display
    function cleanLabel(key) {
        return key.replace(/_/g, ' ')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase());
    }

    // Helper: Extract rich structured clinical summary across all 5 forms
    function extractAssessmentSummaries(child, assessments = []) {
        const rapid = assessments.find(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
        const dev = assessments.find(a => a.form_type === 'Child Development');
        const physio = assessments.find(a => a.form_type === 'Physiotherapy');
        const speech = assessments.find(a => a.form_type === 'Speech Assessment');
        const progressReviews = assessments.filter(a => a.form_type === 'Quarterly Progress Review');

        // 1. Consultation Form
        const rData = rapid?.data || {};
        const rapidSummary = {
            exists: !!rapid,
            id: rapid?.id,
            date: rData.assessment_date || (rapid?.created_at ? new Date(rapid.created_at).toLocaleDateString('en-IN') : null),
            age: rData.age_at_creation || rData.age || rapid?.age_at_creation || child?.age_at_creation || child?.age || '',
            observations: rData.observations || '',
            suggestions: rData.suggestions || '',
            diagnosis: rData.observations ? (rData.observations.length > 50 ? rData.observations.slice(0, 50) + '...' : rData.observations) : (rData.diagnosis || 'Consultation conducted'),
            symptoms: rData.symptoms || 'None recorded',
            birth_history: rData.birth_history || 'Not specified',
            medical_history: rData.medical_history || 'Not specified',
            consultant_name: rData.consultant_name || rData.finalized_by || 'Not specified',
            signature: rData.signature || '',
            finalized_by: rData.consultant_name || rData.finalized_by || 'Not specified',
            teamObservations: [
                { role: 'Physiotherapist', obs: rData.physio_observation, sug: rData.physio_suggestion },
                { role: 'Occupational Therapist', obs: rData.occupational_observation, sug: rData.occupational_suggestion },
                { role: 'Sensory Therapist', obs: rData.sensory_observation, sug: rData.sensory_suggestion },
                { role: 'Speech Therapist', obs: rData.speech_observation, sug: rData.speech_suggestion },
                { role: 'P & O Consultant', obs: rData.po_observation, sug: rData.po_suggestion }
            ].filter(t => t.obs || t.sug)
        };

        // 2. Child Development / Child Assessment Sheet
        const dData = dev?.data || {};
        const delays = [
            dData.cognitive_delay_speech ? `Speech Delay: ${dData.cognitive_delay_speech}` : (dData.speech_delay ? `Speech: ${dData.speech_delay}` : ''),
            dData.cognitive_delay_schooling ? `Schooling: ${dData.cognitive_delay_schooling}` : '',
            dData.gross_motor_delay ? `Gross Motor: ${dData.gross_motor_delay}` : '',
            dData.fine_motor_delay ? `Fine Motor: ${dData.fine_motor_delay}` : '',
            dData.cognitive_delay ? `Cognitive: ${dData.cognitive_delay}` : ''
        ].filter(Boolean);

        const conditions = [
            dData.known_cp && dData.known_cp !== 'No' ? `CP: ${dData.known_cp}${dData.known_cp_desc ? ` (${dData.known_cp_desc})` : ''}` : '',
            dData.known_genetic && dData.known_genetic !== 'No' ? `Genetic: ${dData.known_genetic}${dData.known_genetic_desc ? ` (${dData.known_genetic_desc})` : ''}` : '',
            dData.known_unknown_disease && dData.known_unknown_disease !== 'No' ? `Unknown Disease: ${dData.known_unknown_disease}` : '',
            dData.known_talipes && dData.known_talipes !== 'No' ? `Talipes: ${dData.known_talipes}` : '',
            dData.known_upper_extremity && dData.known_upper_extremity !== 'Normal' ? `Upper Extremity: ${dData.known_upper_extremity}` : '',
            dData.known_accident && dData.known_accident !== 'No' ? `Accident: ${dData.known_accident} ${dData.known_accident_desc || ''}` : '',
            dData.known_infection && dData.known_infection !== 'No' ? `Infection: ${dData.known_infection} ${dData.known_infection_desc || ''}` : '',
            dData.known_other ? `Other: ${dData.known_other}` : '',
            dData.neuromotor_impairment ? `Neuromotor: ${dData.neuromotor_impairment}` : '',
            dData.hearing_impairment ? `Hearing: ${dData.hearing_impairment}` : '',
            dData.vision_impairment ? `Vision: ${dData.vision_impairment}` : '',
            dData.adhd ? `ADHD: ${dData.adhd}` : '',
            dData.behaviour_disorder ? `Behaviour: ${dData.behaviour_disorder}` : '',
            dData.learning_disorder ? `Learning: ${dData.learning_disorder}` : '',
            dData.convulsions ? `Convulsions: ${dData.convulsions} ${dData.convulsions_desc || ''}` : ''
        ].filter(Boolean);

        const deliveryList = [
            dData.delivery_type ? `Type: ${dData.delivery_type}` : '',
            dData.delivery_place ? `Place: ${dData.delivery_place}` : '',
            dData.delivery_term ? `Term: ${dData.delivery_term}` : '',
            dData.birth_weight ? `Birth Wt: ${dData.birth_weight}` : '',
            dData.birth_colour ? `Colour: ${dData.birth_colour}` : '',
            dData.birth_cry ? `Birth Cry: ${dData.birth_cry}` : '',
            dData.incubator_support ? `Incubator: ${dData.incubator_support}` : '',
            dData.hospital_stay_days ? `Hospital Stay: ${dData.hospital_stay_days}d` : ''
        ].filter(Boolean);

        const anthropometryList = [
            dData.height ? `Height: ${dData.height}cm` : '',
            dData.weight ? `Weight: ${dData.weight}kg` : '',
            dData.bmi ? `BMI: ${dData.bmi}` : '',
            dData.head_circ ? `Head Circ: ${dData.head_circ}cm` : '',
            dData.chest_circ ? `Chest: ${dData.chest_circ}cm` : '',
            dData.muac_r ? `MUAC(R): ${dData.muac_r}` : '',
            dData.muac_l ? `MUAC(L): ${dData.muac_l}` : ''
        ].filter(Boolean);

        const devMilestones = [];
        const msDefinitions = [
            { key: 'ms_social_smile', label: 'Social Smile (< 3m)' },
            { key: 'ms_eye_contact', label: 'Eye Contact (< 3m)' },
            { key: 'ms_babbling', label: 'Babbling (< 5m)' },
            { key: 'ms_words', label: 'Words (< 12m)' },
            { key: 'ms_sentences', label: 'Sentences (< 24m)' },
            { key: 'ms_sitting', label: 'Sitting (< 8m)' },
            { key: 'ms_crawling', label: 'Crawling (< 10m)' },
            { key: 'ms_standing', label: 'Standing (< 14m)' },
            { key: 'ms_walking', label: 'Walking (< 18m)' }
        ];
        msDefinitions.forEach(m => {
            const val = dData[m.key];
            const detail = dData[`${m.key}_detail`];
            if (val) {
                devMilestones.push(`${m.label}: ${val}${detail ? ` (${detail})` : ''}`);
            }
        });
        if (devMilestones.length === 0 && dData.milestones) {
            const legacyMs = Array.isArray(dData.milestones) ? dData.milestones : [dData.milestones];
            legacyMs.forEach(item => devMilestones.push(item));
        }

        const devSummary = {
            exists: !!dev,
            id: dev?.id,
            date: dev?.created_at ? new Date(dev.created_at).toLocaleDateString('en-IN') : null,
            diagnosis: (dData.known_cp && dData.known_cp !== 'No' ? `CP: ${dData.known_cp} ${dData.known_cp_desc || ''}` : '') || dData.dev_diagnosis || dData.developmental_diagnosis || dData.clinical_impression || dData.diagnosis || 'Child Assessment Completed',
            chief_complaints: dData.chief_complaints || dData.chief_complaint || (dData.grade ? `Grade: ${dData.grade}` : 'Child developmental evaluation conducted'),
            informant: dData.informant ? `${dData.informant} (${dData.relationship || 'Guardian'})` : (dData.guardian_type ? dData.guardian_type : 'Parents'),
            delivery: deliveryList.join(' · ') || 'Perinatal history documented',
            anthropometry: anthropometryList.join(' · ') || '',
            delays,
            conditions,
            milestones: devMilestones,
            goals: dData.previous_therapies || dData.available_aids_appliances || dData.parent_expectations || dData.previous_corc_interventions || dData.treatment_goal || dData.treatment_plan || '',
            assessed_by: dData.assessed_by || ''
        };

        // 3. Physiotherapy
        const pData = physio?.data || {};
        const deformities = [
            pData.scoliosis ? `Scoliosis: ${pData.scoliosis}` : '',
            pData.kyphosis ? `Kyphosis: ${pData.kyphosis}` : '',
            pData.hyper_lordosis ? `Lordosis: ${pData.hyper_lordosis}` : '',
            pData.equines_left || pData.equines_right ? `Equinus: L(${pData.equines_left || '-'}), R(${pData.equines_right || '-'})` : '',
            pData.bow_legs_left || pData.bow_legs_right ? `Bow Legs: L(${pData.bow_legs_left || '-'}), R(${pData.bow_legs_right || '-'})` : '',
            pData.knock_knees_left || pData.knock_knees_right ? `Knock Knees: L(${pData.knock_knees_left || '-'}), R(${pData.knock_knees_right || '-'})` : '',
            pData.flat_foot_left || pData.flat_foot_right ? `Flat Foot: L(${pData.flat_foot_left || '-'}), R(${pData.flat_foot_right || '-'})` : '',
            pData.hand_def_left || pData.hand_def_right ? `Hand Deformity: L(${pData.hand_def_left || '-'}), R(${pData.hand_def_right || '-'})` : '',
            pData.elbow_def_left || pData.elbow_def_right ? `Elbow Deformity: L(${pData.elbow_def_left || '-'}), R(${pData.elbow_def_right || '-'})` : ''
        ].filter(Boolean);

        const milestones = [
            pData.gm_head_control ? `Head Control: ${pData.gm_head_control}` : '',
            pData.gm_rolling ? `Rolling: ${pData.gm_rolling}` : '',
            pData.gm_alt_crawling ? `Crawling: ${pData.gm_alt_crawling}` : '',
            pData.gm_sit_no_support ? `Sit (no support): ${pData.gm_sit_no_support}` : '',
            pData.gm_stand_no_support ? `Stand (no support): ${pData.gm_stand_no_support}` : '',
            pData.gm_stair_no_support ? `Stairs: ${pData.gm_stair_no_support}` : '',
            pData.gm_running ? `Running: ${pData.gm_running}` : ''
        ].filter(Boolean);

        const gaitParts = [
            pData.gait_pattern ? `Pattern: ${pData.gait_pattern}` : '',
            pData.gait_without_support ? `Walks independently: ${pData.gait_without_support}` : '',
            pData.gait_with_support ? `Walks with support: ${pData.gait_with_support}` : '',
            pData.gait_no_walk ? `Unable to walk: ${pData.gait_no_walk}` : '',
            pData.use_of_aids ? `Aids: ${pData.use_of_aids}` : ''
        ].filter(Boolean);

        const physioSummary = {
            exists: !!physio,
            id: physio?.id,
            date: physio?.created_at ? new Date(physio.created_at).toLocaleDateString('en-IN') : null,
            diagnosis: pData.physio_diagnosis || pData.diagnosis || 'Pediatric Physiotherapy Assessment',
            gait: gaitParts.join(' · ') || 'Functional mobility evaluation completed',
            tone: pData.muscle_tone_general || 'Evaluated',
            clonus: pData.clonus || 'None',
            deformities,
            milestones,
            plan: pData.physio_treatment_plan || pData.treatment_plan || 'Targeted physiotherapy protocol',
            assessed_by: pData.assessed_by || ''
        };

        // 4. Speech Assessment
        const sData = speech?.data || {};
        const speechSummary = {
            exists: !!speech,
            id: speech?.id,
            date: speech?.created_at ? new Date(speech.created_at).toLocaleDateString('en-IN') : null,
            diagnosis: sData.speech_diagnosis || sData.diagnosis || 'Speech-Language Evaluation',
            articulation: sData.speech_articulation ? `${sData.speech_articulation} ${sData.speech_articulation_soda ? `(SODA: ${sData.speech_articulation_soda})` : ''} ${sData.speech_articulation_nasality ? `(Nasality: ${sData.speech_articulation_nasality})` : ''}` : 'Evaluated',
            voice: sData.speech_voice ? `${sData.speech_voice} ${sData.speech_quality ? `(${sData.speech_quality})` : ''} ${sData.speech_pitch ? `Pitch: ${sData.speech_pitch}` : ''}` : 'Normal / Evaluated',
            rhythm: sData.speech_rhythm ? `${sData.speech_rhythm} ${sData.speech_rhythm_defective || ''}` : 'Normal',
            intonation: sData.speech_intonation ? `${sData.speech_intonation} ${sData.speech_intonation_defective || ''}` : 'Normal',
            intelligibility: sData.speech_intelligibility ? `${sData.speech_intelligibility} ${sData.speech_intelligibility_defective || ''}` : 'Context known intelligible',
            plan: sData.speech_follow_up || sData.short_term_goals || sData.recommendations || 'Speech-language therapy sessions',
            assessed_by: sData.speech_assessed_by || ''
        };

        // 5. Quarterly Progress Review(s)
        const progressList = progressReviews.map(pr => {
            const prData = pr.data || {};
            const lt = Array.isArray(prData.long_term_goal) ? prData.long_term_goal.filter(Boolean).join('; ') : (prData.long_term_goal || '');
            const st = Array.isArray(prData.short_term_goal) ? prData.short_term_goal.filter(Boolean).join('; ') : (prData.short_term_goal || '');
            const ach = Array.isArray(prData.achievement) ? prData.achievement.filter(Boolean).join('; ') : (prData.achievement || prData.goal_achievements || prData.overall_progress || '');
            const nxt = Array.isArray(prData.next_plan) ? prData.next_plan.filter(Boolean).join('; ') : (prData.next_plan || '');
            return {
                id: pr.id,
                date: pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-IN') : (prData.review_date || 'N/A'),
                quarter: prData.quarter || 'Progress Review',
                long_term: lt,
                short_term: st,
                achievement: ach || 'Goal progression tracked',
                next_plan: nxt || 'Continue therapy plan'
            };
        });

        const coreCount = [rapid, dev, physio, speech].filter(Boolean).length;
        const workupStatus = coreCount === 4 ? 'complete' : (assessments.length > 0 ? 'partial' : 'none');

        return {
            rapid: rapidSummary,
            dev: devSummary,
            physio: physioSummary,
            speech: speechSummary,
            progress: progressList,
            coreCount,
            totalCount: assessments.length,
            workupStatus,
            raw: {
                rapid: rData,
                dev: dData,
                physio: pData,
                speech: sData,
                rapidAssessment: rapid,
                devAssessment: dev,
                physioAssessment: physio
            }
        };
    }

    // Helper: Normalize and aggregate fields across all clinical assessments for the Germany Summary Sheet
        // Helper: Normalize and aggregate fields across all clinical assessments for the Germany Summary Sheet
    function getSummaryFields(child, assessments = []) {
        const s = extractAssessmentSummaries(child, assessments);
        const rData = s.raw?.rapid || {};
        const dData = s.raw?.dev || {};
        const pData = s.raw?.physio || {};
        const sData = s.raw?.speech || {};

        const ageYears = extractChildAge(child);
        const ageStr = extractChildAgeString(child);
        const assessmentDate = rData.assessment_date || dData.assessment_date || pData.assessment_date || s.rapid.date || s.dev.date || s.physio.date || new Date().toLocaleDateString('en-IN');
        const slNo = child.admission_no || `#${child.id}`;

        const cleanVal = (v, defaultVal = '—') => {
            if (v === undefined || v === null || String(v).trim() === '') return defaultVal;
            return String(v).trim();
        };

        const planText = pData.physio_treatment_plan || '';
        const aidsText = pData.use_of_aids || pData.external_devices || '';

        return {
            assessmentDate,
            slNo,
            name: cleanVal(child.name),
            sex: cleanVal(child.sex),
            dob: cleanVal(child.dob),
            age: ageStr,
            grade: cleanVal(child.grade || dData.grade || rData.grade),
            address: cleanVal(child.address || dData.address || rData.address),

            // Anthropometry
            height: cleanVal(dData.height || rData.height),
            weight: cleanVal(dData.weight || rData.weight),
            bmi: cleanVal(dData.bmi || rData.bmi),
            headCirc: cleanVal(dData.head_circ || dData.head_circumference || rData.head_circ),
            chestCirc: cleanVal(dData.chest_circ || dData.chest_circumference || rData.chest_circ),
            muacR: cleanVal(dData.muac_r),
            muacL: cleanVal(dData.muac_l),

            // Family History
            consanguinity: cleanVal(dData.consanguinity || rData.consanguinity),
            siblingsBrothers: cleanVal(dData.siblings_brothers || rData.siblings_brothers, '0'),
            siblingsSisters: cleanVal(dData.siblings_sisters || rData.siblings_sisters, '0'),
            siblingsTotal: cleanVal(dData.siblings_count || rData.siblings_count, '0'),
            birthOrder: cleanVal(dData.birth_order || rData.birth_order),
            pregnancies: cleanVal(dData.no_of_pregnancies || rData.no_of_pregnancies),
            deliveries: cleanVal(dData.no_of_deliveries || rData.no_of_deliveries),
            disabilityInFamily: cleanVal(dData.family_disability || rData.family_disability),

            // Pre-natal
            motherPregnancyHealth: cleanVal(dData.mother_pregnancy_health || rData.mother_health, 'Normal'),
            rhIncompatibility: cleanVal(dData.rh_incompatibility || rData.rh_incompatibility, 'No'),
            pregnancyInfections: cleanVal(dData.pregnancy_infections || rData.pregnancy_infections, 'None'),

            // Peri-natal
            deliveryType: cleanVal(dData.delivery_type || rData.delivery_type, 'Normal'),
            deliveryPlace: cleanVal(dData.delivery_place || rData.delivery_place, 'Hospital'),
            deliveryTerm: cleanVal(dData.delivery_term || rData.delivery_term, 'Full term'),
            prematureMonth: cleanVal(dData.premature_month, ''),
            birthCry: cleanVal(dData.birth_cry || rData.birth_cry, 'Cried'),
            birthWeight: cleanVal(dData.birth_weight || rData.birth_weight, 'Normal'),
            birthColour: cleanVal(dData.birth_colour || rData.birth_colour, 'Pink'),

            // Post-natal
            hospitalStayDays: cleanVal(dData.hospital_stay_days || rData.hospital_stay_days),
            incubatorSupport: cleanVal(dData.incubator_support || rData.incubator_support, 'No'),
            oxygenSupport: cleanVal(dData.oxygen_support || rData.oxygen_support, 'No'),
            convulsions: cleanVal(dData.convulsions || rData.convulsions, 'No'),
            majorSurgeries: cleanVal(dData.major_surgeries || rData.major_surgeries, 'None'),

            // Known Diagnosis
            knownCp: cleanVal(dData.known_cp || (rData.diagnosis?.includes('CP') ? 'Yes' : 'No'), 'No'),
            knownGenetic: cleanVal(dData.known_genetic, 'No'),
            knownUnknownDisease: cleanVal(dData.known_unknown_disease, 'No'),
            diagnosis: cleanVal(rData.diagnosis || rData.observations || dData.dev_diagnosis || 'Provisional evaluation'),

            // Cognitive Development
            speechDelay: cleanVal(dData.cognitive_delay_speech || dData.speech_delay, 'Normal'),
            schoolingDelay: cleanVal(dData.cognitive_delay_schooling, 'Regular'),
            msSmile: cleanVal(dData.ms_social_smile, 'Normal'),
            msBabbling: cleanVal(dData.ms_babbling, 'Normal'),
            msEyeContact: cleanVal(dData.ms_eye_contact, 'Normal'),
            msWords: cleanVal(dData.ms_words, 'Normal'),
            msSentences: cleanVal(dData.ms_sentences, 'Normal'),

            // Developmental Delay and Disability
            visionImpairment: cleanVal(dData.vision_impairment, 'None'),
            hearingImpairment: cleanVal(dData.hearing_impairment, 'None'),
            neuromotorImpairment: cleanVal(dData.neuromotor_impairment, 'None'),

            // Objectives
            doctorReports: cleanVal(dData.doctor_reports || rData.doctor_reports, 'None'),
            imagingReports: cleanVal(dData.imaging_reports || rData.imaging_reports, 'None'),
            previousTherapies: cleanVal(dData.previous_therapies || pData.previous_therapies || rData.previous_therapies, 'None'),
            parentExpectations: cleanVal(dData.parent_expectations || rData.parent_expectations, 'Improve functional independence'),

            // Part 2: Physiotherapy Assessment
            // Motor Milestones
            msSitting: cleanVal(pData.gm_sit_support || pData.gm_sit_no_support || dData.ms_sitting, 'Normal'),
            msCrawling: cleanVal(pData.gm_alt_crawling || dData.ms_crawling, 'Normal'),
            msStanding: cleanVal(pData.gm_stand_support || pData.gm_stand_no_support || dData.ms_standing, 'Normal'),
            msWalking: cleanVal(pData.gait_without_support || pData.gait_with_support || dData.ms_walking, 'Normal'),
            useOfAids: cleanVal(pData.use_of_aids || pData.aids_used, 'None'),

            // Visible Deformity (Right / Left)
            knockKneesR: cleanVal(pData.knock_knees_right, 'No'), knockKneesL: cleanVal(pData.knock_knees_left, 'No'),
            bowLegsR: cleanVal(pData.bow_legs_right, 'No'), bowLegsL: cleanVal(pData.bow_legs_left, 'No'),
            flatFootR: cleanVal(pData.flat_foot_right, 'No'), flatFootL: cleanVal(pData.flat_foot_left, 'No'),
            equinesR: cleanVal(pData.equines_right, 'No'), equinesL: cleanVal(pData.equines_left, 'No'),
            elbowDefR: cleanVal(pData.elbow_def_right, 'No'), elbowDefL: cleanVal(pData.elbow_def_left, 'No'),
            handDefR: cleanVal(pData.hand_def_right, 'No'), handDefL: cleanVal(pData.hand_def_left, 'No'),
            deformityOthers: cleanVal(pData.deformity_others || pData.impairment_others, 'None'),

            // Impairment of Body Structure
            scoliosis: cleanVal(pData.scoliosis, 'No'),
            kyphosis: cleanVal(pData.kyphosis, 'No'),
            hyperLordosis: cleanVal(pData.hyper_lordosis, 'No'),
            impairmentOthers: cleanVal(pData.impairment_others, 'None'),

            // Gross Motor (all 20 items)
            gmHeadControl: cleanVal(pData.gm_head_control, 'Yes'),
            gmSitSupport: cleanVal(pData.gm_sit_support, 'Yes'),
            gmRolling: cleanVal(pData.gm_rolling, 'Yes'),
            gmSitNoSupport: cleanVal(pData.gm_sit_no_support, 'Yes'),
            gmAltCrawling: cleanVal(pData.gm_alt_crawling, 'Yes'),
            gm4PointKneel: cleanVal(pData.gm_4_point_knell, 'Yes'),
            gmBunnyHopping: cleanVal(pData.gm_bunny_hopping, 'Yes'),
            gm2PointKneel: cleanVal(pData.gm_2_point_knell, 'Yes'),
            gmHalfKneel: cleanVal(pData.gm_half_knell, 'Yes'),
            gmStandNoSupport: cleanVal(pData.gm_stand_no_support, 'Yes'),
            gmStandSupport: cleanVal(pData.gm_stand_support, 'Yes'),
            gmStandTiptoes: cleanVal(pData.gm_stand_tiptoes, 'Yes'),
            gmStandHeels: cleanVal(pData.gm_stand_heels, 'Yes'),
            gmJumpOneLeg: cleanVal(pData.gm_jump_one_leg, 'Yes'),
            gmStandOneLeg: cleanVal(pData.gm_stand_one_leg, 'Yes'),
            gmJumpTwoLegs: cleanVal(pData.gm_jump_two_legs, 'Yes'),
            gmStairSupport: cleanVal(pData.gm_stair_support, 'Yes'),
            gmRunningRegular: cleanVal(pData.gm_regular || pData.gm_running, 'Yes'),
            gmStairNoSupport: cleanVal(pData.gm_stair_no_support, 'Yes'),
            gmRunningIssues: cleanVal(pData.gm_running_issues, 'None'),

            // Transitions without support (all 9 items)
            trSupineProneSit: cleanVal(pData.tr_supine_prone_sit, 'Yes'),
            trProneSupineRoll: cleanVal(pData.tr_prone_supine_roll, 'Yes'),
            trSitSupport: cleanVal(pData.tr_sit_support, 'Yes'),
            trSitNoSupport: cleanVal(pData.tr_sit_no_support, 'Yes'),
            trSitStand: cleanVal(pData.tr_sit_stand, 'Yes'),
            trStandSit: cleanVal(pData.tr_stand_sit, 'Yes'),
            trCrawlKneelStand: cleanVal(pData.tr_crawl_kneel_stand, 'Yes'),
            trStandKneelCrawl: cleanVal(pData.tr_stand_kneel_crawl, 'Yes'),
            trQuadSideSit: cleanVal(pData.tr_quad_side_sit, 'Yes'),

            // Gait Patterns
            gaitWithoutSupport: cleanVal(pData.gait_without_support, 'Yes'),
            gaitWithSupport: cleanVal(pData.gait_with_support, 'No'),
            gaitNoWalk: cleanVal(pData.gait_no_walk, 'No'),
            gaitPattern: cleanVal(pData.gait_pattern, 'Functional reciprocal gait pattern'),

            // ROM Passive
            romHipHorizR: cleanVal(pData.rom_hip_horiz_r, 'Normal'), romHipHorizL: cleanVal(pData.rom_hip_horiz_l, 'Normal'),
            romHipVertR: cleanVal(pData.rom_hip_vert_r, 'Normal'), romHipVertL: cleanVal(pData.rom_hip_vert_l, 'Normal'),
            romHipFlexR: cleanVal(pData.rom_hip_flex_r, 'Normal'), romHipFlexL: cleanVal(pData.rom_hip_flex_l, 'Normal'),
            romHipRotR: cleanVal(pData.rom_hip_rot_r, 'Normal'), romHipRotL: cleanVal(pData.rom_hip_rot_l, 'Normal'),
            romKneeFlexR: cleanVal(pData.rom_knee_flex_r, 'Normal'), romKneeFlexL: cleanVal(pData.rom_knee_flex_l, 'Normal'),
            romAnkleBendR: cleanVal(pData.rom_ankle_bend_r, 'Normal'), romAnkleBendL: cleanVal(pData.rom_ankle_bend_l, 'Normal'),
            romAnkleStrR: cleanVal(pData.rom_ankle_str_r, 'Normal'), romAnkleStrL: cleanVal(pData.rom_ankle_str_l, 'Normal'),
            romElbowFlexR: cleanVal(pData.rom_elbow_flex_r, 'Normal'), romElbowFlexL: cleanVal(pData.rom_elbow_flex_l, 'Normal'),
            romHandR: cleanVal(pData.rom_hand_r, 'Normal'), romHandL: cleanVal(pData.rom_hand_l, 'Normal'),

            // ROM Active
            romActHipFlexR: cleanVal(pData.rom_act_hip_flex_r || pData.rom_hip_flex_r, 'Normal'),
            romActHipFlexL: cleanVal(pData.rom_act_hip_flex_l || pData.rom_hip_flex_l, 'Normal'),
            romActHipRotR: cleanVal(pData.rom_act_hip_rot_r || pData.rom_hip_rot_r, 'Normal'),
            romActHipRotL: cleanVal(pData.rom_act_hip_rot_l || pData.rom_hip_rot_l, 'Normal'),
            romActKneeFlexR: cleanVal(pData.rom_act_knee_flex_r || pData.rom_knee_flex_r, 'Normal'),
            romActKneeFlexL: cleanVal(pData.rom_act_knee_flex_l || pData.rom_knee_flex_l, 'Normal'),
            romActAnkleBendR: cleanVal(pData.rom_act_ankle_bend_r || pData.rom_ankle_bend_r, 'Normal'),
            romActAnkleBendL: cleanVal(pData.rom_act_ankle_bend_l || pData.rom_ankle_bend_l, 'Normal'),
            romActAnkleStrR: cleanVal(pData.rom_act_ankle_str_r || pData.rom_ankle_str_r, 'Normal'),
            romActAnkleStrL: cleanVal(pData.rom_act_ankle_str_l || pData.rom_ankle_str_l, 'Normal'),
            romActElbowFlexR: cleanVal(pData.rom_act_elbow_flex_r || pData.rom_elbow_flex_r, 'Normal'),
            romActElbowFlexL: cleanVal(pData.rom_act_elbow_flex_l || pData.rom_elbow_flex_l, 'Normal'),
            romActWristFlexR: cleanVal(pData.rom_act_wrist_flex_r || pData.rom_hand_r, 'Normal'),
            romActWristFlexL: cleanVal(pData.rom_act_wrist_flex_l || pData.rom_hand_l, 'Normal'),

            // Muscle Strength (1/5 - 5/5)
            strHipR: cleanVal(pData.strength_hip_r, '4/5'), strHipL: cleanVal(pData.strength_hip_l, '4/5'),
            strKneeR: cleanVal(pData.strength_knee_r, '4/5'), strKneeL: cleanVal(pData.strength_knee_l, '4/5'),
            strAnkleR: cleanVal(pData.strength_ankle_r, '4/5'), strAnkleL: cleanVal(pData.strength_ankle_l, '4/5'),
            strShoulderR: cleanVal(pData.strength_shoulder_r, '4/5'), strShoulderL: cleanVal(pData.strength_shoulder_l, '4/5'),
            strElbowR: cleanVal(pData.strength_elbow_r, '4/5'), strElbowL: cleanVal(pData.strength_elbow_l, '4/5'),
            strWristR: cleanVal(pData.strength_wrist_r, '4/5'), strWristL: cleanVal(pData.strength_wrist_l, '4/5'),

            // Neurological & Reflexes
            muscleToneGeneral: cleanVal(pData.muscle_tone_general, 'Normal'),
            clonus: cleanVal(pData.clonus, 'Absent'),
            reflexPatellarR: cleanVal(pData.reflex_patellar_r, 'Normal'), reflexPatellarL: cleanVal(pData.reflex_patellar_l, 'Normal'),
            reflexAchillesR: cleanVal(pData.reflex_achilles_r, 'Normal'), reflexAchillesL: cleanVal(pData.reflex_achilles_l, 'Normal'),
            reflexBabinskiR: cleanVal(pData.reflex_babinski_r, 'Negative'), reflexBabinskiL: cleanVal(pData.reflex_babinski_l, 'Negative'),
            limbLengthR: cleanVal(pData.limb_length_right || pData.reflex_limb_length_r, 'Equal'),
            limbLengthL: cleanVal(pData.limb_length_left || pData.reflex_limb_length_l, 'Equal'),
            coordinationMidline: cleanVal(pData.coordination_midline, 'Yes'),
            fineMotorPinch: cleanVal(pData.fine_motor_pinch, 'Present'),
            fineMotorSupination: cleanVal(pData.fine_motor_supination, 'Present'),

            // Treatment Plan Sub-items (from SUMMARY SHEET.docx)
            tpHeadControl: cleanVal(pData.tp_head_control || (planText.toLowerCase().includes('head') ? planText : '') || 'Head stability & midline alignment training'),
            tpTrunkControl: cleanVal(pData.tp_trunk_control || (planText.toLowerCase().includes('trunk') ? planText : '') || 'Trunk strengthening & postural control'),
            tpSitting: cleanVal(pData.tp_sitting || (planText.toLowerCase().includes('sitting') ? planText : '') || 'Active sitting balance exercises'),
            tpStanding: cleanVal(pData.tp_standing || (planText.toLowerCase().includes('standing') ? planText : '') || 'Weight bearing & standing balance training'),
            tpSideSteps: cleanVal(pData.tp_side_steps || (planText.toLowerCase().includes('side') ? planText : '') || 'Lateral weight shift and stepping practice'),
            tpWalkingAids: cleanVal(pData.tp_walking_aids || (aidsText && aidsText !== 'None' ? `Gait training with ${aidsText}` : '') || 'Gait retraining with assistive support'),
            tpFreeWalking: cleanVal(pData.tp_free_walking || (planText.toLowerCase().includes('walk') ? planText : '') || 'Independent reciprocal walking coordination'),

            // External Devices Sub-items (from SUMMARY SHEET.docx)
            devSplints: cleanVal(pData.dev_splints || (aidsText.toLowerCase().includes('splint') ? 'Prescribed / In use' : 'None')),
            devCpChair: cleanVal(pData.dev_cp_chair || (aidsText.toLowerCase().includes('chair') ? 'Prescribed / In use' : 'None')),
            devStandingFrame: cleanVal(pData.dev_standing_frame || (aidsText.toLowerCase().includes('standing frame') ? 'Prescribed / In use' : 'None')),
            devWheelchair: cleanVal(pData.dev_wheelchair || (aidsText.toLowerCase().includes('wheelchair') ? 'Prescribed / In use' : 'None')),
            devWalker: cleanVal(pData.dev_walker || (aidsText.toLowerCase().includes('walker') ? 'Prescribed / In use' : 'None')),

            // Plan & Devices
            physioOtherComments: cleanVal(pData.physio_other_comments, 'Child is cooperative with clinical assessment'),
            physioTreatmentPlan: cleanVal(pData.physio_treatment_plan, 'Targeted motor retraining, gait conditioning and balance therapy'),
            externalDevices: cleanVal(pData.external_devices || pData.use_of_aids, 'As indicated for positioning and gait support'),
            furtherInvestigations: cleanVal(pData.further_investigations || pData.investigations_needed, 'Sree Chitra / German therapist & pediatrician evaluation recommended')
        };
    }

    // Helper: Escape HTML strings
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\'/g, '&#039;');
    }

    // Helper: Render official Germany Team Child Summary Sheet format in HTML
    function renderChildSummarySheetHtml(child, assessments = []) {
        const f = getSummaryFields(child, assessments);

        return `
            <div class="summary-sheet-doc" id="summary-sheet-doc-printable">
                <div class="summary-sheet-header">
                    <span class="org-badge">CHITRA ORTHO & REHAB CLINIC (CORC)</span>
                    <h2>EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY Mylaudy</h2>
                    <div style="font-size: 1.18rem; font-weight: 800; color: #1e3a8a; margin: 4px 0 2px 0;">CHILD SUMMARY SHEET</div>
                    <div class="sub-badge">Suggestions from Germany Team</div>
                </div>

                <!-- PART 1: INFORMATION SHEET & DEVELOPMENTAL HISTORY -->
                <div class="summary-sheet-section-banner">
                    <span>PART 1: INFORMATION SHEET & DEVELOPMENTAL HISTORY</span>
                    <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.95; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 4px;">Table 0 Format</span>
                </div>

                <table class="summary-sheet-table">
                    <tr>
                        <td class="label-col" style="width: 25%;">DATE OF ASSESSMENT</td>
                        <td class="val-col" style="width: 25%; font-weight: 700; color: #1e40af;">${escapeHtml(f.assessmentDate)}</td>
                        <td class="label-col" style="width: 25%;">SL.NO</td>
                        <td class="val-col" style="width: 25%; font-weight: 700; color: #1e40af;">${escapeHtml(f.slNo)}</td>
                    </tr>
                    <tr>
                        <th colspan="4" class="table-subhead">INFORMATION SHEET</th>
                    </tr>
                    <tr>
                        <td class="label-col">Name</td>
                        <td class="val-col" style="font-weight: 700;">${escapeHtml(f.name)}</td>
                        <td class="label-col">Sex</td>
                        <td class="val-col">${escapeHtml(f.sex)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Date of Birth</td>
                        <td class="val-col">${escapeHtml(f.dob)}</td>
                        <td class="label-col">Age / Grade</td>
                        <td class="val-col">${escapeHtml(f.age)} / Grade: ${escapeHtml(f.grade)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Address</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.address)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Anthropometry</td>
                        <td colspan="3" class="val-col">
                            <strong>Height:</strong> ${escapeHtml(f.height)} cm &nbsp;|&nbsp;
                            <strong>Weight:</strong> ${escapeHtml(f.weight)} kg &nbsp;|&nbsp;
                            <strong>BMI:</strong> ${escapeHtml(f.bmi)} &nbsp;|&nbsp;
                            <strong>Head Circ:</strong> ${escapeHtml(f.headCirc)} cm &nbsp;|&nbsp;
                            <strong>Chest Circ:</strong> ${escapeHtml(f.chestCirc)} cm &nbsp;|&nbsp;
                            <strong>MUAC:</strong> R: ${escapeHtml(f.muacR)}, L: ${escapeHtml(f.muacL)}
                        </td>
                    </tr>
                    <tr>
                        <td class="label-col">Consanguinity</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.consanguinity)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Siblings</td>
                        <td class="val-col">Brothers: ${escapeHtml(f.siblingsBrothers)} | Sisters: ${escapeHtml(f.siblingsSisters)} | Total: ${escapeHtml(f.siblingsTotal)}</td>
                        <td class="label-col">Birth Order / Pregnancies</td>
                        <td class="val-col">Order: ${escapeHtml(f.birthOrder)} | Pregnancies: ${escapeHtml(f.pregnancies)} | Deliveries: ${escapeHtml(f.deliveries)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">History of disability in family</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.disabilityInFamily)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">PRE-NATAL HISTORY</th>
                    </tr>
                    <tr>
                        <td class="label-col">Health of mother during pregnancy</td>
                        <td class="val-col">${escapeHtml(f.motherPregnancyHealth)}</td>
                        <td class="label-col">RH incompatibility</td>
                        <td class="val-col">${escapeHtml(f.rhIncompatibility)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Any infectious disease</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.pregnancyInfections)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">PERI-NATAL HISTORY</th>
                    </tr>
                    <tr>
                        <td class="label-col">Type of delivery</td>
                        <td class="val-col">${escapeHtml(f.deliveryType)}</td>
                        <td class="label-col">Place of delivery</td>
                        <td class="val-col">${escapeHtml(f.deliveryPlace)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Term</td>
                        <td class="val-col">${escapeHtml(f.deliveryTerm)} ${f.prematureMonth ? `(${escapeHtml(f.prematureMonth)})` : ''}</td>
                        <td class="label-col">Birth cry</td>
                        <td class="val-col">${escapeHtml(f.birthCry)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Birth weight</td>
                        <td class="val-col">${escapeHtml(f.birthWeight)}</td>
                        <td class="label-col">Birth colour</td>
                        <td class="val-col">${escapeHtml(f.birthColour)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">POST NATAL HISTORY</th>
                    </tr>
                    <tr>
                        <td class="label-col">Days stay in hospital</td>
                        <td class="val-col">${escapeHtml(f.hospitalStayDays)}</td>
                        <td class="label-col">Incubator support</td>
                        <td class="val-col">${escapeHtml(f.incubatorSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Oxygens</td>
                        <td class="val-col">${escapeHtml(f.oxygenSupport)}</td>
                        <td class="label-col">Fits / convulsions</td>
                        <td class="val-col">${escapeHtml(f.convulsions)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Any major surgery</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.majorSurgeries)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">KNOWN DIAGNOSIS</th>
                    </tr>
                    <tr>
                        <td class="label-col">Cerebral Palsy</td>
                        <td class="val-col">${escapeHtml(f.knownCp)}</td>
                        <td class="label-col">Genetic disorder</td>
                        <td class="val-col">${escapeHtml(f.knownGenetic)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Unknown underlying disease</td>
                        <td class="val-col">${escapeHtml(f.knownUnknownDisease)}</td>
                        <td class="label-col">Clinical Diagnosis</td>
                        <td class="val-col" style="font-weight: 700; color: #1e3a8a;">${escapeHtml(f.diagnosis)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">COGNITIVE DEVELOPMENT</th>
                    </tr>
                    <tr>
                        <td class="label-col">Cognitive Delay</td>
                        <td colspan="3" class="val-col">Speech: ${escapeHtml(f.speechDelay)} &nbsp;|&nbsp; Schooling: ${escapeHtml(f.schoolingDelay)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Social smile &lt; 3 m</td>
                        <td class="val-col">${escapeHtml(f.msSmile)}</td>
                        <td class="label-col">Babbling &lt; 5 m</td>
                        <td class="val-col">${escapeHtml(f.msBabbling)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Eye contact &lt; 3 m</td>
                        <td class="val-col">${escapeHtml(f.msEyeContact)}</td>
                        <td class="label-col">Words &lt; 12 m</td>
                        <td class="val-col">${escapeHtml(f.msWords)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Sentences &lt; 24 m</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.msSentences)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">DEVELOPMENTAL DELAY AND DISABILITY</th>
                    </tr>
                    <tr>
                        <td class="label-col">Vision Impairment</td>
                        <td class="val-col">${escapeHtml(f.visionImpairment)}</td>
                        <td class="label-col">Hearing impairment</td>
                        <td class="val-col">${escapeHtml(f.hearingImpairment)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Neuro-motor impairment</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.neuromotorImpairment)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">OBJECTIVES</th>
                    </tr>
                    <tr>
                        <td class="label-col">Previous reports from doctors</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.doctorReports)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Previous reports from imaging</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.imagingReports)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Previous therapies</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.previousTherapies)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Expectations of the parents</td>
                        <td colspan="3" class="val-col" style="color: #1e40af; font-weight: 600;">${escapeHtml(f.parentExpectations)}</td>
                    </tr>
                </table>

                <!-- PART 2: PHYSIOTHERAPY ASSESSMENT & FUNCTIONAL EVALUATION -->
                <div class="summary-sheet-section-banner" style="margin-top: 25px;">
                    <span>PART 2: PHYSIOTHERAPY ASSESSMENT & FUNCTIONAL EVALUATION</span>
                    <span style="font-size: 0.72rem; font-weight: 600; opacity: 0.95; background: rgba(255,255,255,0.15); padding: 2px 8px; border-radius: 4px;">Table 1 Format</span>
                </div>

                <table class="summary-sheet-table">
                    <tr>
                        <th colspan="4" class="table-subhead">MOTOR MILESTONES</th>
                    </tr>
                    <tr>
                        <td class="label-col">Sitting &lt; 8 months</td>
                        <td class="val-col">${escapeHtml(f.msSitting)}</td>
                        <td class="label-col">Crawling &lt; 10 m</td>
                        <td class="val-col">${escapeHtml(f.msCrawling)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Standing &lt; 14 m</td>
                        <td class="val-col">${escapeHtml(f.msStanding)}</td>
                        <td class="label-col">Walking &lt; 18 m</td>
                        <td class="val-col">${escapeHtml(f.msWalking)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Use of aids</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.useOfAids)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">VISIBLE DEFORMITY</th>
                    </tr>
                    <tr>
                        <td class="label-col">Knock knees</td>
                        <td class="val-col">Rt: ${escapeHtml(f.knockKneesR)} | Lt: ${escapeHtml(f.knockKneesL)}</td>
                        <td class="label-col">Bow legs</td>
                        <td class="val-col">Rt: ${escapeHtml(f.bowLegsR)} | Lt: ${escapeHtml(f.bowLegsL)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Flat foot</td>
                        <td class="val-col">Rt: ${escapeHtml(f.flatFootR)} | Lt: ${escapeHtml(f.flatFootL)}</td>
                        <td class="label-col">Equines</td>
                        <td class="val-col">Rt: ${escapeHtml(f.equinesR)} | Lt: ${escapeHtml(f.equinesL)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Elbow deformity</td>
                        <td class="val-col">Rt: ${escapeHtml(f.elbowDefR)} | Lt: ${escapeHtml(f.elbowDefL)}</td>
                        <td class="label-col">Hand deformity</td>
                        <td class="val-col">Rt: ${escapeHtml(f.handDefR)} | Lt: ${escapeHtml(f.handDefL)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Others</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.deformityOthers)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">IMPAIRMENT OF BODY STRUCTURE</th>
                    </tr>
                    <tr>
                        <td class="label-col">Scoliosis</td>
                        <td class="val-col">${escapeHtml(f.scoliosis)}</td>
                        <td class="label-col">Kyphosis</td>
                        <td class="val-col">${escapeHtml(f.kyphosis)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Hyper lordosis</td>
                        <td class="val-col">${escapeHtml(f.hyperLordosis)}</td>
                        <td class="label-col">Others</td>
                        <td class="val-col">${escapeHtml(f.impairmentOthers)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">GROSS MOTOR</th>
                    </tr>
                    <tr>
                        <td class="label-col">Head control</td>
                        <td class="val-col">${escapeHtml(f.gmHeadControl)}</td>
                        <td class="label-col">Sitting with support</td>
                        <td class="val-col">${escapeHtml(f.gmSitSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Rolling</td>
                        <td class="val-col">${escapeHtml(f.gmRolling)}</td>
                        <td class="label-col">Sitting without support</td>
                        <td class="val-col">${escapeHtml(f.gmSitNoSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Alternating crawling</td>
                        <td class="val-col">${escapeHtml(f.gmAltCrawling)}</td>
                        <td class="label-col">4 point kneeling</td>
                        <td class="val-col">${escapeHtml(f.gm4PointKneel)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Bunny hopping</td>
                        <td class="val-col">${escapeHtml(f.gmBunnyHopping)}</td>
                        <td class="label-col">2 point kneeling</td>
                        <td class="val-col">${escapeHtml(f.gm2PointKneel)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Half kneeling</td>
                        <td class="val-col">${escapeHtml(f.gmHalfKneel)}</td>
                        <td class="label-col">Standing without support</td>
                        <td class="val-col">${escapeHtml(f.gmStandNoSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Standing with support</td>
                        <td class="val-col">${escapeHtml(f.gmStandSupport)}</td>
                        <td class="label-col">Standing on tip toes</td>
                        <td class="val-col">${escapeHtml(f.gmStandTiptoes)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Standing on heels</td>
                        <td class="val-col">${escapeHtml(f.gmStandHeels)}</td>
                        <td class="label-col">Jumping on one leg</td>
                        <td class="val-col">${escapeHtml(f.gmJumpOneLeg)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Standing on one leg</td>
                        <td class="val-col">${escapeHtml(f.gmStandOneLeg)}</td>
                        <td class="label-col">Jumping on two legs</td>
                        <td class="val-col">${escapeHtml(f.gmJumpTwoLegs)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Stair climbing with support</td>
                        <td class="val-col">${escapeHtml(f.gmStairSupport)}</td>
                        <td class="label-col">Running regular</td>
                        <td class="val-col">${escapeHtml(f.gmRunningRegular)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Stair climbing without support</td>
                        <td class="val-col">${escapeHtml(f.gmStairNoSupport)}</td>
                        <td class="label-col">Running Issues</td>
                        <td class="val-col">${escapeHtml(f.gmRunningIssues)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">TRANSITION WITHOUT SUPPORT</th>
                    </tr>
                    <tr>
                        <td class="label-col">Supine - prone - sitting</td>
                        <td class="val-col">${escapeHtml(f.trSupineProneSit)}</td>
                        <td class="label-col">Prone - supine - rolling</td>
                        <td class="val-col">${escapeHtml(f.trProneSupineRoll)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Sitting with support</td>
                        <td class="val-col">${escapeHtml(f.trSitSupport)}</td>
                        <td class="label-col">Sitting without support</td>
                        <td class="val-col">${escapeHtml(f.trSitNoSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Sitting - Standing</td>
                        <td class="val-col">${escapeHtml(f.trSitStand)}</td>
                        <td class="label-col">Standing - Sitting</td>
                        <td class="val-col">${escapeHtml(f.trStandSit)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Crawling - Kneeling - Half kneeling - Standing</td>
                        <td class="val-col">${escapeHtml(f.trCrawlKneelStand)}</td>
                        <td class="label-col">Standing - Half kneeling - Kneeling - Crawling</td>
                        <td class="val-col">${escapeHtml(f.trStandKneelCrawl)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Quadruped - side sitting</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.trQuadSideSit)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">GAIT PATTERNS</th>
                    </tr>
                    <tr>
                        <td class="label-col">Without support</td>
                        <td class="val-col">${escapeHtml(f.gaitWithoutSupport)}</td>
                        <td class="label-col">With support</td>
                        <td class="val-col">${escapeHtml(f.gaitWithSupport)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">No walk</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.gaitNoWalk)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Gait pattern details</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.gaitPattern)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">JOINT RANGE OF MOTION (ROM) PASSIVE &amp; ACTIVE</th>
                    </tr>
                    <tr>
                        <td class="label-col">Hip ROM (Passive)</td>
                        <td colspan="3" class="val-col">
                            Horiz. abd/add: Rt (${escapeHtml(f.romHipHorizR)}) Lt (${escapeHtml(f.romHipHorizL)}) &nbsp;|&nbsp;
                            Vert. abd/add: Rt (${escapeHtml(f.romHipVertR)}) Lt (${escapeHtml(f.romHipVertL)}) &nbsp;|&nbsp;
                            Flex/Ext: Rt (${escapeHtml(f.romHipFlexR)}) Lt (${escapeHtml(f.romHipFlexL)}) &nbsp;|&nbsp;
                            Rotation: Rt (${escapeHtml(f.romHipRotR)}) Lt (${escapeHtml(f.romHipRotL)})
                        </td>
                    </tr>
                    <tr>
                        <td class="label-col">Hip ROM (Active)</td>
                        <td colspan="3" class="val-col">
                            Flex/Ext: Rt (${escapeHtml(f.romActHipFlexR)}) Lt (${escapeHtml(f.romActHipFlexL)}) &nbsp;|&nbsp;
                            Rotation: Rt (${escapeHtml(f.romActHipRotR)}) Lt (${escapeHtml(f.romActHipRotL)})
                        </td>
                    </tr>
                    <tr>
                        <td class="label-col">Knee &amp; Ankle ROM</td>
                        <td colspan="3" class="val-col">
                            Knee Flex/Ext (Pass): Rt (${escapeHtml(f.romKneeFlexR)}) Lt (${escapeHtml(f.romKneeFlexL)}) &nbsp;|&nbsp;
                            Knee (Act): Rt (${escapeHtml(f.romActKneeFlexR)}) Lt (${escapeHtml(f.romActKneeFlexL)})<br>
                            Ankle (Bended): Rt (${escapeHtml(f.romAnkleBendR)}) Lt (${escapeHtml(f.romAnkleBendL)}) &nbsp;|&nbsp;
                            Ankle (Straight): Rt (${escapeHtml(f.romAnkleStrR)}) Lt (${escapeHtml(f.romAnkleStrL)})
                        </td>
                    </tr>
                    <tr>
                        <td class="label-col">Upper Limb ROM</td>
                        <td colspan="3" class="val-col">
                            Elbow Flex/Ext: Rt (${escapeHtml(f.romElbowFlexR)}) Lt (${escapeHtml(f.romElbowFlexL)}) &nbsp;|&nbsp;
                            Hand/Wrist: Rt (${escapeHtml(f.romHandR)}) Lt (${escapeHtml(f.romHandL)})
                        </td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">MUSCLE STRENGTH (1/5 - 5/5)</th>
                    </tr>
                    <tr>
                        <td class="label-col">Hip / Knee / Ankle</td>
                        <td colspan="3" class="val-col">
                            Hip: Rt (${escapeHtml(f.strHipR)}) Lt (${escapeHtml(f.strHipL)}) &nbsp;|&nbsp;
                            Knee: Rt (${escapeHtml(f.strKneeR)}) Lt (${escapeHtml(f.strKneeL)}) &nbsp;|&nbsp;
                            Ankle: Rt (${escapeHtml(f.strAnkleR)}) Lt (${escapeHtml(f.strAnkleL)})
                        </td>
                    </tr>
                    <tr>
                        <td class="label-col">Shoulder / Elbow / Wrist</td>
                        <td colspan="3" class="val-col">
                            Shoulder: Rt (${escapeHtml(f.strShoulderR)}) Lt (${escapeHtml(f.strShoulderL)}) &nbsp;|&nbsp;
                            Elbow: Rt (${escapeHtml(f.strElbowR)}) Lt (${escapeHtml(f.strElbowL)}) &nbsp;|&nbsp;
                            Wrist &amp; Fingers: Rt (${escapeHtml(f.strWristR)}) Lt (${escapeHtml(f.strWristL)})
                        </td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">NEUROLOGICAL &amp; REFLEXES</th>
                    </tr>
                    <tr>
                        <td class="label-col">Muscle tone in general</td>
                        <td class="val-col">${escapeHtml(f.muscleToneGeneral)}</td>
                        <td class="label-col">Clonus</td>
                        <td class="val-col">${escapeHtml(f.clonus)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Patellar reflex</td>
                        <td class="val-col">Rt: ${escapeHtml(f.reflexPatellarR)} | Lt: ${escapeHtml(f.reflexPatellarL)}</td>
                        <td class="label-col">Achilles reflex</td>
                        <td class="val-col">Rt: ${escapeHtml(f.reflexAchillesR)} | Lt: ${escapeHtml(f.reflexAchillesL)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Babinski reflex</td>
                        <td class="val-col">Rt: ${escapeHtml(f.reflexBabinskiR)} | Lt: ${escapeHtml(f.reflexBabinskiL)}</td>
                        <td class="label-col">Limb length measurement</td>
                        <td class="val-col">Rt: ${escapeHtml(f.limbLengthR)} | Lt: ${escapeHtml(f.limbLengthL)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Co-ordination</td>
                        <td class="val-col">Able to cross midline: ${escapeHtml(f.coordinationMidline)}</td>
                        <td class="label-col">Fine Motor Assessment</td>
                        <td class="val-col">Pinch: ${escapeHtml(f.fineMotorPinch)} | Pro/supination: ${escapeHtml(f.fineMotorSupination)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Other comments</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.physioOtherComments)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">TREATMENT PLAN</th>
                    </tr>
                    <tr>
                        <td class="label-col">Head control</td>
                        <td class="val-col">${escapeHtml(f.tpHeadControl)}</td>
                        <td class="label-col">Trunk control</td>
                        <td class="val-col">${escapeHtml(f.tpTrunkControl)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Sitting position</td>
                        <td class="val-col">${escapeHtml(f.tpSitting)}</td>
                        <td class="label-col">Standing position</td>
                        <td class="val-col">${escapeHtml(f.tpStanding)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Side steps</td>
                        <td class="val-col">${escapeHtml(f.tpSideSteps)}</td>
                        <td class="label-col">Walking with aids</td>
                        <td class="val-col">${escapeHtml(f.tpWalkingAids)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Free walking gait pattern</td>
                        <td colspan="3" class="val-col" style="font-weight: 600; color: #1e3a8a;">${escapeHtml(f.tpFreeWalking)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">EXTERNAL DEVICES</th>
                    </tr>
                    <tr>
                        <td class="label-col">Splints</td>
                        <td class="val-col">${escapeHtml(f.devSplints)}</td>
                        <td class="label-col">CP chair</td>
                        <td class="val-col">${escapeHtml(f.devCpChair)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Standing frame</td>
                        <td class="val-col">${escapeHtml(f.devStandingFrame)}</td>
                        <td class="label-col">Wheel Chair</td>
                        <td class="val-col">${escapeHtml(f.devWheelchair)}</td>
                    </tr>
                    <tr>
                        <td class="label-col">Walker</td>
                        <td colspan="3" class="val-col">${escapeHtml(f.devWalker)}</td>
                    </tr>

                    <tr>
                        <th colspan="4" class="table-subhead">FURTHER INVESTIGATIONS NEEDED</th>
                    </tr>
                    <tr>
                        <td class="label-col">(Sree Chitra, General pediatrician, German therapist, German doctors)</td>
                        <td colspan="3" class="val-col" style="font-weight: 600; color: #0f172a;">${escapeHtml(f.furtherInvestigations)}</td>
                    </tr>
                </table>
            </div>
        `;
    }

function printChildSummarySheet(child, assessments = []) {
        if (!child) return;
        const sheetHtml = renderChildSummarySheetHtml(child, assessments);
        const printWin = window.open('', '_blank', 'width=950,height=850');
        if (!printWin) {
            window.print();
            return;
        }

        printWin.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Child Summary Sheet - ${escapeHtml(child.name || 'Patient')}</title>
    <link rel="stylesheet" href="styles.css">
    <style>
        body {
            background: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            padding: 12px;
            margin: 0;
        }
        .summary-sheet-doc {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }
        @media print {
            body { padding: 0; }
            @page {
                size: A4 portrait;
                margin: 10mm;
            }
        }
    </style>
</head>
<body>
    ${sheetHtml}
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.focus();
                window.print();
            }, 300);
        };
    </script>
</body>
</html>`);
        printWin.document.close();
    }

    // Helper: Build the complete Multi-Disciplinary Dossier HTML for a child (all forms together!)
    function renderChildConsolidatedCardHtml(child, assessments = [], isFullModal = false) {
        const summary = extractAssessmentSummaries(child, assessments);
        const ageYears = extractChildAge(child);
        const ageStr = extractChildAgeString(child);
        const safeChildJson = JSON.stringify({ id: child.id, name: child.name, admission_no: child.admission_no || '', dob: child.dob, sex: child.sex, mobile: child.mobile }).replace(/"/g, '&quot;');

        const statusBadgeText = summary.coreCount === 4 
            ? '✓ 4/4 Core Complete' 
            : (summary.totalCount > 0 ? `${summary.coreCount}/4 Disciplines Done` : 'Pending Workup (0)');
        const statusBadgeBg = summary.coreCount === 4 ? '#dcfce7' : (summary.totalCount > 0 ? '#fef9c3' : '#fee2e2');
        const statusBadgeColor = summary.coreCount === 4 ? '#15803d' : (summary.totalCount > 0 ? '#a16207' : '#b91c1c');

        // Form 1 Panel: Consultation Form
        const r = summary.rapid;
        const rapidPanelHtml = `
            <div class="summary-form-panel ${r.exists ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>🩺</span> <span>Consultation Form</span>
                    </div>
                    ${r.exists ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="summary-panel-date">📅 ${r.date}</span>
                            <button class="btn-summary-view-form btn-secondary btn-sm" data-id="${r.id}" style="padding: 2px 7px; font-size: 0.75rem;">View Form</button>
                        </div>
                    ` : `
                        <button class="btn-conduct-form btn-secondary btn-sm" data-form="consultation-form" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Conduct</button>
                    `}
                </div>
                ${r.exists ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${r.observations ? `
                            <div class="summary-field-box" style="background: #eff6ff; border-color: #bfdbfe;">
                                <div class="field-label" style="color: #1e40af;">Observations</div>
                                <div class="field-val" style="color: #1e3a8a; white-space: pre-wrap;">${r.observations}</div>
                            </div>
                        ` : (r.diagnosis ? `
                            <div class="summary-field-box" style="background: #eff6ff; border-color: #bfdbfe;">
                                <div class="field-label" style="color: #1e40af;">Clinical Finding</div>
                                <div class="field-val" style="font-weight: 700; color: #1e3a8a;">${r.diagnosis}</div>
                            </div>
                        ` : '')}
                        ${r.suggestions ? `
                            <div class="summary-field-box" style="background: #f0fdf4; border-color: #bbf7d0;">
                                <div class="field-label" style="color: #166534;">Suggestions &amp; Guidance</div>
                                <div class="field-val" style="color: #14532d; white-space: pre-wrap;">${r.suggestions}</div>
                            </div>
                        ` : ''}
                        <div class="summary-field-box">
                            <div class="field-label">Reported Symptoms</div>
                            <div class="field-val">${r.symptoms}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Birth & Medical History</div>
                            <div class="field-val"><strong>Birth:</strong> ${r.birth_history} | <strong>Med:</strong> ${r.medical_history}</div>
                        </div>
                        ${r.teamObservations.length ? `
                            <div class="summary-field-box">
                                <div class="field-label">Multi-disciplinary Observations</div>
                                <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
                                    ${r.teamObservations.map(t => `
                                        <div style="font-size: 0.8rem; border-left: 2px solid #3b82f6; padding-left: 6px;">
                                            <strong style="color: #2563eb;">${t.role}:</strong> ${t.obs ? `Obs: ${t.obs}` : ''} ${t.sug ? `| Sug: ${t.sug}` : ''}
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px; display: flex; justify-content: space-between; flex-wrap: wrap;">
                            <span><strong>Consultant:</strong> ${r.consultant_name || r.finalized_by}</span>
                            ${r.signature ? `<span><strong>Signature:</strong> ${r.signature}</span>` : ''}
                        </div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ Initial Consultation &amp; Counselling not conducted yet</span>
                    </div>
                `}
            </div>
        `;

        // Form 2 Panel: Child Development
        const d = summary.dev;
        const devPanelHtml = `
            <div class="summary-form-panel ${d.exists ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>👶</span> <span>Child Development Assessment</span>
                    </div>
                    ${d.exists ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="summary-panel-date">📅 ${d.date}</span>
                            <button class="btn-summary-view-form btn-secondary btn-sm" data-id="${d.id}" style="padding: 2px 7px; font-size: 0.75rem;">View Form</button>
                        </div>
                    ` : `
                        <button class="btn-conduct-form btn-secondary btn-sm" data-form="child-development" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Conduct</button>
                    `}
                </div>
                ${d.exists ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="summary-field-box" style="background: #fdf2f8; border-color: #fbcfe8;">
                            <div class="field-label" style="color: #9d174d;">Developmental Impression & Diagnosis</div>
                            <div class="field-val" style="font-weight: 700; color: #831843;">${d.diagnosis}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Chief Complaints & Informant</div>
                            <div class="field-val">${d.chief_complaints} <span style="color: #64748b;">(Informant: ${d.informant})</span></div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Perinatal & Birth Profile</div>
                            <div class="field-val">${d.delivery}</div>
                        </div>
                        ${d.anthropometry ? `
                            <div class="summary-field-box">
                                <div class="field-label">Anthropometry & Growth</div>
                                <div class="field-val">${d.anthropometry}</div>
                            </div>
                        ` : ''}
                        ${d.delays.length ? `
                            <div class="summary-field-box" style="background: #fef2f2; border-color: #fecaca;">
                                <div class="field-label" style="color: #991b1b;">Identified Developmental Delays</div>
                                <div class="field-val" style="color: #b91c1c; font-weight: 600;">${d.delays.join(' · ')}</div>
                            </div>
                        ` : ''}
                        ${d.conditions.length ? `
                            <div class="summary-field-box" style="background: #fffbeb; border-color: #fde68a;">
                                <div class="field-label" style="color: #92400e;">Impairments & Associated Conditions</div>
                                <div class="field-val" style="color: #78350f;">${d.conditions.join(' · ')}</div>
                            </div>
                        ` : ''}
                        ${d.milestones && d.milestones.length ? `
                            <div class="summary-field-box" style="background: #f0fdf4; border-color: #bbf7d0;">
                                <div class="field-label" style="color: #166534;">Developmental Milestones (Age 0-2 yrs)</div>
                                <div class="field-val" style="color: #14532d;">${d.milestones.join(' · ')}</div>
                            </div>
                        ` : ''}
                        ${d.goals ? `
                            <div class="summary-field-box">
                                <div class="field-label">Treatment Goals & Expectations</div>
                                <div class="field-val">${d.goals}</div>
                            </div>
                        ` : ''}
                        ${d.assessed_by ? `<div style="font-size: 0.78rem; color: #64748b;"><strong>Assessed by:</strong> ${d.assessed_by}</div>` : ''}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ Comprehensive developmental evaluation pending</span>
                    </div>
                `}
            </div>
        `;

        // Form 3 Panel: Physiotherapy
        const p = summary.physio;
        const physioPanelHtml = `
            <div class="summary-form-panel ${p.exists ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>💪</span> <span>Physiotherapy Assessment</span>
                    </div>
                    ${p.exists ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="summary-panel-date">📅 ${p.date}</span>
                            <button class="btn-summary-view-form btn-secondary btn-sm" data-id="${p.id}" style="padding: 2px 7px; font-size: 0.75rem;">View Form</button>
                        </div>
                    ` : `
                        <button class="btn-conduct-form btn-secondary btn-sm" data-form="physiotherapy" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Conduct</button>
                    `}
                </div>
                ${p.exists ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="summary-field-box" style="background: #f0fdf4; border-color: #bbf7d0;">
                            <div class="field-label" style="color: #166534;">Physiotherapy Diagnosis</div>
                            <div class="field-val" style="font-weight: 700; color: #14532d;">${p.diagnosis}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Gait & Mobility</div>
                            <div class="field-val">${p.gait}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Muscle Tone & Clonus</div>
                            <div class="field-val"><strong>Tone:</strong> ${p.tone} | <strong>Clonus:</strong> ${p.clonus}</div>
                        </div>
                        ${p.deformities.length ? `
                            <div class="summary-field-box" style="background: #fff7ed; border-color: #fed7aa;">
                                <div class="field-label" style="color: #9a3412;">Observed Deformities / Structural Findings</div>
                                <div class="field-val" style="color: #7c2d12;">${p.deformities.join(' · ')}</div>
                            </div>
                        ` : ''}
                        ${p.milestones.length ? `
                            <div class="summary-field-box">
                                <div class="field-label">Key Gross Motor Milestones</div>
                                <div class="field-val">${p.milestones.join(' · ')}</div>
                            </div>
                        ` : ''}
                        <div class="summary-field-box" style="background: #f8fafc;">
                            <div class="field-label">Rehabilitation Treatment Plan</div>
                            <div class="field-val">${p.plan}</div>
                        </div>
                        ${p.assessed_by ? `<div style="font-size: 0.78rem; color: #64748b;"><strong>Assessed by:</strong> ${p.assessed_by}</div>` : ''}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ Functional physiotherapy assessment pending</span>
                    </div>
                `}
            </div>
        `;

        // Form 4 Panel: Speech Assessment
        const s = summary.speech;
        const speechPanelHtml = `
            <div class="summary-form-panel ${s.exists ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>🗣️</span> <span>Speech & Language Assessment</span>
                    </div>
                    ${s.exists ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="summary-panel-date">📅 ${s.date}</span>
                            <button class="btn-summary-view-form btn-secondary btn-sm" data-id="${s.id}" style="padding: 2px 7px; font-size: 0.75rem;">View Form</button>
                        </div>
                    ` : `
                        <button class="btn-conduct-form btn-secondary btn-sm" data-form="speech" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Conduct</button>
                    `}
                </div>
                ${s.exists ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="summary-field-box" style="background: #faf5ff; border-color: #e9d5ff;">
                            <div class="field-label" style="color: #6b21a8;">Speech & Language Diagnosis</div>
                            <div class="field-val" style="font-weight: 700; color: #581c87;">${s.diagnosis}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Articulation & Voice</div>
                            <div class="field-val"><strong>Articulation:</strong> ${s.articulation} | <strong>Voice:</strong> ${s.voice}</div>
                        </div>
                        <div class="summary-field-box">
                            <div class="field-label">Speech Parameters</div>
                            <div class="field-val"><strong>Rhythm:</strong> ${s.rhythm} | <strong>Intonation:</strong> ${s.intonation} | <strong>Intelligibility:</strong> ${s.intelligibility}</div>
                        </div>
                        <div class="summary-field-box" style="background: #eff6ff; border-color: #bfdbfe;">
                            <div class="field-label" style="color: #1e40af;">Therapy Goals & Follow-Up Plan</div>
                            <div class="field-val" style="color: #1e3a8a;">${s.plan}</div>
                        </div>
                        ${s.assessed_by ? `<div style="font-size: 0.78rem; color: #64748b;"><strong>Assessed by:</strong> ${s.assessed_by}</div>` : ''}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ Speech and communication assessment pending</span>
                    </div>
                `}
            </div>
        `;

        // Form 5 Panel: Quarterly Progress Review(s)
        const prog = summary.progress;
        const progressPanelHtml = `
            <div class="summary-form-panel ${prog.length ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>📈</span> <span>Quarterly Progress Reviews (${prog.length})</span>
                    </div>
                    <button class="btn-conduct-form btn-secondary btn-sm" data-form="progress-review" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Add Review</button>
                </div>
                ${prog.length ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${prog.slice(0, 3).map((pr, idx) => `
                            <div class="summary-field-box" style="border-left: 3px solid #6366f1;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <strong style="color: #4338ca; font-size: 0.83rem;">${pr.quarter}</strong>
                                    <span style="font-size: 0.75rem; color: #64748b;">📅 ${pr.date}</span>
                                </div>
                                ${pr.long_term ? `<div style="font-size: 0.8rem; margin-top: 2px;"><strong>Long Term:</strong> ${pr.long_term}</div>` : ''}
                                ${pr.short_term ? `<div style="font-size: 0.8rem; margin-top: 2px;"><strong>Short Term:</strong> ${pr.short_term}</div>` : ''}
                                <div style="font-size: 0.8rem; margin-top: 3px; color: #15803d;"><strong>Quarter Achievement:</strong> ${pr.achievement}</div>
                                <div style="font-size: 0.8rem; margin-top: 2px; color: #1e3a8a;"><strong>Next Quarter Plan:</strong> ${pr.next_plan}</div>
                            </div>
                        `).join('')}
                        ${prog.length > 3 ? `<div style="font-size: 0.78rem; color: #64748b; text-align: center;">+ ${prog.length - 3} more review(s) in record</div>` : ''}
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ No quarterly progress reviews logged yet</span>
                    </div>
                `}
            </div>
        `;

        if (isFullModal) {
            return `
                <div class="summary-forms-grid" style="grid-template-columns: 1fr;">
                    ${rapidPanelHtml}
                    ${devPanelHtml}
                    ${physioPanelHtml}
                    ${speechPanelHtml}
                    ${progressPanelHtml}
                </div>
            `;
        }

        return `
            <div class="summary-child-card status-${summary.workupStatus}" id="summary-child-card-${child.id}">
                <!-- Header -->
                <div class="summary-card-header" data-child-id="${child.id}">
                    <div class="summary-card-header-main">
                        <div class="summary-child-avatar">${(child.name || 'C').charAt(0).toUpperCase()}</div>
                        <div class="summary-child-info">
                            <strong>${child.admission_no ? `<span class="adm-badge" style="display:inline-block; font-size:0.75rem; background:#1e40af; color:#ffffff; border-radius:4px; padding:2px 7px; margin-right:8px; font-weight:700;">${child.admission_no}</span>` : ''}${child.name}</strong>
                            <div class="summary-child-meta">${ageStr} / ${child.sex || '-'} · ${child.admission_no ? `${child.admission_no} · ` : ''}📱 ${child.mobile || 'None'} · ID: #${child.id}</div>
                        </div>
                    </div>

                    <!-- Discipline Status Badges -->
                    <div class="summary-card-disciplines-bar">
                        <span class="discipline-pill ${summary.rapid.exists ? 'done' : 'pending'}">🩺 Consultation: ${summary.rapid.exists ? '✓ ' + summary.rapid.date : 'Pending'}</span>
                        <span class="discipline-pill ${summary.dev.exists ? 'done' : 'pending'}">👶 Dev: ${summary.dev.exists ? '✓ ' + summary.dev.date : 'Pending'}</span>
                        <span class="discipline-pill ${summary.physio.exists ? 'done' : 'pending'}">💪 Physio: ${summary.physio.exists ? '✓ ' + summary.physio.date : 'Pending'}</span>
                        <span class="discipline-pill ${summary.speech.exists ? 'done' : 'pending'}">🗣️ Speech: ${summary.speech.exists ? '✓ ' + summary.speech.date : 'Pending'}</span>
                        <span class="discipline-pill ${summary.progress.length ? 'done' : 'pending'}">📈 Reviews: ${summary.progress.length ? summary.progress.length + ' done' : 'None'}</span>
                    </div>

                    <!-- Actions -->
                    <div class="summary-card-actions">
                        <span class="discipline-pill" style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-weight: 700;">${statusBadgeText}</span>
                        <button class="btn-card-export-pdf btn-secondary btn-sm" data-child-json="${safeChildJson}" style="background: #fff; font-weight: 600;">📄 PDF</button>
                        <button class="btn-card-open-folder btn-secondary btn-sm" data-child-json="${safeChildJson}" style="background: #fff;">📁 Folder</button>
                        <span class="folder-toggle" style="font-size: 1.1rem; color: #64748b;">▸</span>
                    </div>
                </div>

                <!-- Body (All 5 forms together) - Minimized by default -->
                <div class="summary-card-body" id="summary-card-body-${child.id}" style="display: none;">
                    <div class="summary-forms-grid">
                        ${rapidPanelHtml}
                        ${devPanelHtml}
                        ${physioPanelHtml}
                        ${speechPanelHtml}
                        ${progressPanelHtml}
                    </div>
                </div>
            </div>
        `;
    }

    // Helper: Build Matrix Table Row HTML for a child
    function renderMatrixTableRowHtml(child, assessments = [], index = 0) {
        const summary = extractAssessmentSummaries(child, assessments);
        const ageYears = extractChildAge(child);
        const ageStr = extractChildAgeString(child);
        const safeChildJson = JSON.stringify({ id: child.id, name: child.name, admission_no: child.admission_no || '', dob: child.dob, sex: child.sex, mobile: child.mobile }).replace(/"/g, '&quot;');

        const r = summary.rapid;
        const d = summary.dev;
        const p = summary.physio;
        const s = summary.speech;
        const prog = summary.progress;

        const statusPill = summary.coreCount === 4 
            ? '<span class="discipline-pill done">✓ Complete (4/4)</span>'
            : (summary.totalCount > 0 ? `<span class="discipline-pill" style="background:#fef9c3; color:#854d0e;">Partial (${summary.coreCount}/4)</span>` : '<span class="discipline-pill pending">Pending (0)</span>');

        const admBadge = child.admission_no 
            ? `<span class="adm-badge" style="font-size:0.75rem; color:#1e40af; background:#eff6ff; border:1px solid #bfdbfe; border-radius:3px; padding:1px 6px; margin-right:6px; font-weight:700;">${child.admission_no}</span>`
            : '';

        return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 14px; text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
                <td style="padding: 12px 14px;">
                    <strong style="color: #0f172a; font-size: 0.92rem; display: block;">${admBadge}${child.name}</strong>
                    <div style="font-size: 0.78rem; color: #64748b;">${ageStr} / ${child.sex || '-'} · 📱 ${child.mobile || 'None'}</div>
                </td>
                <td style="padding: 12px 14px;">
                    ${r.exists ? `
                        <div class="matrix-snippet-box">
                            <strong>${r.diagnosis}</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${r.date}${r.age ? ` · <span style="color:#059669; font-weight:700;">Age: ${r.age}</span>` : ''}</div>
                            <div style="color: #64748b; font-size: 0.76rem; margin-top: 2px;">Symptoms: ${r.symptoms}</div>
                        </div>
                    ` : '<span style="color: #cbd5e1;">—</span>'}
                </td>
                <td style="padding: 12px 14px;">
                    ${d.exists ? `
                        <div class="matrix-snippet-box">
                            <strong>${d.diagnosis}</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${d.date}</div>
                            ${d.delays.length ? `<div style="color: #b91c1c; font-size: 0.75rem; margin-top: 2px;">${d.delays.slice(0, 2).join(', ')}</div>` : ''}
                        </div>
                    ` : '<span style="color: #cbd5e1;">—</span>'}
                </td>
                <td style="padding: 12px 14px;">
                    ${p.exists ? `
                        <div class="matrix-snippet-box">
                            <strong>${p.diagnosis}</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${p.date}</div>
                            <div style="color: #64748b; font-size: 0.76rem; margin-top: 2px;">Tone: ${p.tone} | ${p.gait.slice(0, 35)}</div>
                        </div>
                    ` : '<span style="color: #cbd5e1;">—</span>'}
                </td>
                <td style="padding: 12px 14px;">
                    ${s.exists ? `
                        <div class="matrix-snippet-box">
                            <strong>${s.diagnosis}</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${s.date}</div>
                            <div style="color: #64748b; font-size: 0.76rem; margin-top: 2px;">${s.articulation}</div>
                        </div>
                    ` : '<span style="color: #cbd5e1;">—</span>'}
                </td>
                <td style="padding: 12px 14px;">
                    ${prog.length ? `
                        <div class="matrix-snippet-box">
                            <strong>${prog[0].quarter} (${prog.length})</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${prog[0].date}</div>
                            <div style="color: #15803d; font-size: 0.76rem; margin-top: 2px;">${prog[0].achievement.slice(0, 45)}</div>
                        </div>
                    ` : '<span style="color: #cbd5e1;">—</span>'}
                </td>
                <td style="padding: 12px 14px; text-align: center;">${statusPill}</td>
                <td style="padding: 12px 14px; text-align: center;">
                    <div style="display: flex; gap: 4px; justify-content: center;">
                        <button class="btn-matrix-view-dossier btn-secondary btn-sm" data-child-json="${safeChildJson}" style="padding: 3px 8px; font-size: 0.78rem; font-weight: 600; background: #eff6ff; color: #1e40af; border-color: #bfdbfe;">📋 Dossier</button>
                        <button class="btn-matrix-export-pdf btn-secondary btn-sm" data-child-json="${safeChildJson}" style="padding: 3px 8px; font-size: 0.78rem; font-weight: 600;">📄</button>
                    </div>
                </td>
            </tr>
        `;
    }

    // ── Dedicated Assessment Summaries Hub: Fetch & Render ─────────────────
    async function fetchAndRenderAssessmentSummaries() {
        const kpisEl = document.getElementById('main-summary-kpis');
        const cardsContainer = document.getElementById('summary-cards-container');
        const matrixTbody = document.getElementById('summary-matrix-tbody');
        if (!cardsContainer || !matrixTbody) return;

        cardsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-light);"><span style="font-size: 2rem; display: block; margin-bottom: 8px;">⏳</span>Loading consolidated assessment summaries for all children...</div>';
        matrixTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-light);">Loading assessment matrix...</td></tr>';

        try {
            const res = await fetch('/api/children' + ((userRole === 'autism' || userRole === 'asd') ? '?autism=true' : ''));
            if (!res.ok) {
                cardsContainer.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 30px;">Failed to load children assessment records.</div>';
                return;
            }
            const allChildren = await res.json();
            
            // Respect staff role restrictions
            allSummaryChildrenList = allChildren.filter(c => matchesAgeFilter(c));

            renderMainAssessmentSummariesView();

            // Set up search and filter inputs
            const searchInput = document.getElementById('main-summary-search');
            const statusFilter = document.getElementById('main-summary-status-filter');
            const ageFilter = document.getElementById('main-summary-age-filter');

            const handleFilter = () => renderMainAssessmentSummariesView();

            if (searchInput) searchInput.oninput = handleFilter;
            if (statusFilter) statusFilter.onchange = handleFilter;
            if (ageFilter) ageFilter.onchange = handleFilter;

        } catch (err) {
            console.error('Error in fetchAndRenderAssessmentSummaries:', err);
            cardsContainer.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 30px;">Error connecting to assessment server.</div>';
        }
    }

    // Render Main Assessment Summaries View with current filters
    function renderMainAssessmentSummariesView() {
        const kpisEl = document.getElementById('main-summary-kpis');
        const cardsContainer = document.getElementById('summary-cards-container');
        const matrixTbody = document.getElementById('summary-matrix-tbody');
        const searchInput = document.getElementById('main-summary-search');
        const statusFilter = document.getElementById('main-summary-status-filter');
        const ageFilter = document.getElementById('main-summary-age-filter');

        const q = (searchInput?.value || '').toLowerCase().trim();
        const sf = statusFilter?.value || 'all';
        const af = ageFilter?.value || 'all';

        let list = allSummaryChildrenList.filter(c => matchesAgeFilter(c, af));

        if (q) {
            list = list.filter(c => {
                const nameMatch = c.name && c.name.toLowerCase().includes(q);
                const admMatch = c.admission_no && c.admission_no.toLowerCase().includes(q);
                const mobileMatch = c.mobile && c.mobile.includes(q);
                const aList = c.assessments || [];
                const diagMatch = aList.some(a => {
                    const d = a.data || {};
                    const txt = JSON.stringify(d).toLowerCase();
                    return txt.includes(q);
                });
                return nameMatch || admMatch || mobileMatch || diagMatch;
            });
        }

        if (sf === 'completed') {
            list = list.filter(c => {
                const aList = c.assessments || [];
                return ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => aList.some(a => a.form_type === t));
            });
        } else if (sf === 'partial') {
            list = list.filter(c => {
                const aList = c.assessments || [];
                const majorDone = ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => aList.some(a => a.form_type === t)).length;
                return majorDone > 0 && majorDone < 4;
            });
        } else if (sf === 'none') {
            list = list.filter(c => !c.assessments || c.assessments.length === 0);
        } else if (sf === 'missing-consultation' || sf === 'missing-rapid') {
            list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment')));
        } else if (sf === 'missing-dev') {
            list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Child Development')));
        } else if (sf === 'missing-physio') {
            list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Physiotherapy')));
        } else if (sf === 'missing-speech') {
            list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Speech Assessment')));
        }

        // Compute KPIs
        const totalChildren = list.length;
        let fullyAssessed = 0;
        let partiallyAssessed = 0;
        let noneAssessed = 0;
        let totalAssessments = 0;

        list.forEach(c => {
            const aList = c.assessments || [];
            totalAssessments += aList.length;
            const hasRapid = aList.some(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
            const hasDev = aList.some(a => a.form_type === 'Child Development');
            const hasPhysio = aList.some(a => a.form_type === 'Physiotherapy');
            const hasSpeech = aList.some(a => a.form_type === 'Speech Assessment');
            const majorDone = [hasRapid, hasDev, hasPhysio, hasSpeech].filter(Boolean).length;

            if (majorDone === 4) fullyAssessed++;
            else if (aList.length > 0) partiallyAssessed++;
            else noneAssessed++;
        });

        if (kpisEl) {
            kpisEl.innerHTML = `
                <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #475569; text-transform: uppercase;">Total Registered Children</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-top: 3px;">${totalChildren}</div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">In selected filter</div>
                </div>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #166534; text-transform: uppercase;">Fully Assessed (4/4 Core)</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #15803d; margin-top: 3px;">${fullyAssessed}</div>
                    <div style="font-size: 0.75rem; color: #166534; margin-top: 2px;">Complete Multi-Disciplinary</div>
                </div>
                <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #854d0e; text-transform: uppercase;">Partially Assessed (1-3)</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #a16207; margin-top: 3px;">${partiallyAssessed}</div>
                    <div style="font-size: 0.75rem; color: #854d0e; margin-top: 2px;">In-Progress Workups</div>
                </div>
                <div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #991b1b; text-transform: uppercase;">Awaiting Assessment (0)</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #b91c1c; margin-top: 3px;">${noneAssessed}</div>
                    <div style="font-size: 0.75rem; color: #991b1b; margin-top: 2px;">Needs Initial Triage</div>
                </div>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #1e40af; text-transform: uppercase;">Total Completed Forms</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1d4ed8; margin-top: 3px;">${totalAssessments}</div>
                    <div style="font-size: 0.75rem; color: #1e40af; margin-top: 2px;">Clinical records stored</div>
                </div>
            `;
        }

        const sheetsContainer = document.getElementById('summary-sheets-container');
        const btnToggleAllCards = document.getElementById('btn-toggle-all-cards');

        // Apply container visibility based on currentMainSummaryView
        if (sheetsContainer) {
            sheetsContainer.style.display = currentMainSummaryView === 'sheet' ? 'flex' : 'none';
        }
        if (cardsContainer) {
            cardsContainer.style.display = currentMainSummaryView === 'cards' ? 'flex' : 'none';
        }
        const matrixContainer = document.getElementById('summary-matrix-container');
        if (matrixContainer) {
            matrixContainer.style.display = currentMainSummaryView === 'matrix' ? 'block' : 'none';
        }
        if (btnToggleAllCards) {
            btnToggleAllCards.style.display = (currentMainSummaryView === 'cards' || currentMainSummaryView === 'sheet') ? 'inline-flex' : 'none';
        }

        if (!list.length) {
            if (sheetsContainer) {
                sheetsContainer.innerHTML = `
                    <div style="text-align: center; padding: 45px 20px; background: white; border-radius: 8px; border: 1px dashed #cbd5e1;">
                        <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">📭</span>
                        <strong style="color: #334155; font-size: 1.05rem;">No child profiles match current search or filters.</strong>
                        <p style="color: #64748b; font-size: 0.85rem; margin-top: 4px;">Try adjusting the status or age filters above.</p>
                    </div>
                `;
            }
            cardsContainer.innerHTML = `
                <div style="text-align: center; padding: 45px 20px; background: white; border-radius: 8px; border: 1px dashed #cbd5e1;">
                    <span style="font-size: 2.5rem; display: block; margin-bottom: 8px;">📭</span>
                    <strong style="color: #334155; font-size: 1.05rem;">No child profiles match current search or filters.</strong>
                    <p style="color: #64748b; font-size: 0.85rem; margin-top: 4px;">Try adjusting the status or age filters above.</p>
                </div>
            `;
            matrixTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-light);">No matching children found.</td></tr>';
            return;
        }

        // Render Germany Summary Sheets (Minimized by Default)
        if (sheetsContainer) {
            sheetsContainer.innerHTML = list.map(c => {
                const summary = extractAssessmentSummaries(c, c.assessments || []);
                const ageYears = extractChildAge(c);
                const ageStr = extractChildAgeString(c);
                const statusBadgeBg = summary.coreCount === 4 ? '#dcfce7' : (summary.coreCount > 0 ? '#fef9c3' : '#fee2e2');
                const statusBadgeColor = summary.coreCount === 4 ? '#166534' : (summary.coreCount > 0 ? '#854d0e' : '#991b1b');
                const statusBadgeText = summary.coreCount === 4 ? 'Fully Assessed' : (summary.coreCount > 0 ? `${summary.coreCount}/4 Completed` : 'Not Assessed');

                return `
                <div class="sheet-summary-card" id="sheet-summary-card-${c.id}" style="background: white; border-radius: 8px; border: 1px solid #cbd5e1; padding: 14px 18px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); transition: all 0.2s ease;">
                    <div class="sheet-summary-header" data-child-id="${c.id}" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 12px; min-width: 240px;">
                            <span class="sheet-toggle-icon" id="sheet-toggle-icon-${c.id}" style="font-size: 1.15rem; color: #64748b; font-weight: bold; width: 16px; display: inline-block;">▸</span>
                            <div style="width: 38px; height: 38px; border-radius: 50%; background: #e0f2fe; color: #0369a1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; border: 1px solid #bae6fd;">
                                ${(c.name || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style="font-weight: 700; color: #1e3a8a; font-size: 1.05rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span>${c.name}</span>
                                    ${c.admission_no ? `<span class="adm-badge" style="font-size: 0.78rem; background: #1e40af; color: #ffffff; padding: 2px 7px; border-radius: 4px; font-weight: 700;">${c.admission_no}</span>` : ''}
                                </div>
                                <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
                                    ${ageStr} / ${c.sex || '-'} · 📱 ${c.mobile || 'None'} · ID: #${c.id} · <span style="background: ${statusBadgeBg}; color: ${statusBadgeColor}; font-weight: 600; padding: 1px 6px; border-radius: 4px; font-size: 0.75rem;">${statusBadgeText}</span>
                                </div>
                            </div>
                        </div>
                        <div class="sheet-header-actions" style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                            <button type="button" class="btn-main-sheet-print btn-secondary btn-sm" data-child-id="${c.id}" style="display: flex; align-items: center; gap: 4px; font-weight: 600;">
                                🖨️ Print Sheet
                            </button>
                            <button type="button" class="btn-main-sheet-pdf btn-primary btn-sm" data-child-id="${c.id}" style="display: flex; align-items: center; gap: 4px; font-weight: 600;">
                                📄 Export PDF
                            </button>
                            <button type="button" class="btn-main-sheet-details btn-secondary btn-sm" data-child-id="${c.id}" style="display: flex; align-items: center; gap: 4px; font-weight: 600; color: #1e40af; border-color: #bfdbfe;">
                                📋 Full Dossier
                            </button>
                            <button type="button" class="btn-toggle-sheet btn-secondary btn-sm" data-child-id="${c.id}" style="display: flex; align-items: center; gap: 4px; font-weight: 600; background: #f8fafc; border-color: #cbd5e1; color: #334155;">
                                <span class="sheet-toggle-label" id="sheet-toggle-label-${c.id}">View Sheet</span>
                                <span class="sheet-toggle-arrow" id="sheet-toggle-arrow-${c.id}">▾</span>
                            </button>
                        </div>
                    </div>
                    <!-- Minimized / Collapsed by default -->
                    <div class="sheet-collapsible-body" id="sheet-body-${c.id}" style="display: none; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                        ${renderChildSummarySheetHtml(c, c.assessments || [])}
                    </div>
                </div>
            `;
            }).join('');

            sheetsContainer.querySelectorAll('.sheet-summary-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    if (e.target.closest('.btn-main-sheet-print') || e.target.closest('.btn-main-sheet-pdf') || e.target.closest('.btn-main-sheet-details')) {
                        return;
                    }
                    const childId = header.getAttribute('data-child-id');
                    const body = document.getElementById(`sheet-body-${childId}`);
                    const icon = document.getElementById(`sheet-toggle-icon-${childId}`);
                    const label = document.getElementById(`sheet-toggle-label-${childId}`);
                    const arrow = document.getElementById(`sheet-toggle-arrow-${childId}`);
                    if (body) {
                        const isHidden = body.style.display === 'none';
                        body.style.display = isHidden ? 'block' : 'none';
                        if (icon) icon.textContent = isHidden ? '▾' : '▸';
                        if (label) label.textContent = isHidden ? 'Collapse Sheet' : 'View Sheet';
                        if (arrow) arrow.textContent = isHidden ? '▴' : '▾';
                    }
                });
            });

            sheetsContainer.querySelectorAll('.btn-main-sheet-print').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cid = btn.getAttribute('data-child-id');
                    const ch = allSummaryChildrenList.find(x => String(x.id) === String(cid));
                    if (ch) printChildSummarySheet(ch, ch.assessments || []);
                });
            });
            sheetsContainer.querySelectorAll('.btn-main-sheet-pdf').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cid = btn.getAttribute('data-child-id');
                    const ch = allSummaryChildrenList.find(x => String(x.id) === String(cid));
                    if (ch) generateChildSummaryPdf(ch, ch.assessments || []);
                });
            });
            sheetsContainer.querySelectorAll('.btn-main-sheet-details').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cid = btn.getAttribute('data-child-id');
                    const ch = allSummaryChildrenList.find(x => String(x.id) === String(cid));
                    if (ch) openChildSummaryModal(ch);
                });
            });
        }

        cardsContainer.innerHTML = list.map(c => renderChildConsolidatedCardHtml(c, c.assessments || [])).join('');
        matrixTbody.innerHTML = list.map((c, idx) => renderMatrixTableRowHtml(c, c.assessments || [], idx)).join('');

        // Wire Cards View events
        cardsContainer.querySelectorAll('.summary-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const childId = header.getAttribute('data-child-id');
                const body = document.getElementById(`summary-card-body-${childId}`);
                const toggle = header.querySelector('.folder-toggle');
                if (body) {
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'flex' : 'none';
                    if (toggle) toggle.textContent = isHidden ? '▾' : '▸';
                }
            });
        });

        // Wire Export PDF buttons on individual cards
        cardsContainer.querySelectorAll('.btn-card-export-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const child = JSON.parse(btn.getAttribute('data-child-json'));
                const fullChild = allSummaryChildrenList.find(c => c.id === child.id) || child;
                generateChildSummaryPdf(fullChild, fullChild.assessments || []);
            });
        });

        // Wire Open Folder buttons on individual cards
        cardsContainer.querySelectorAll('.btn-card-open-folder').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const child = JSON.parse(btn.getAttribute('data-child-json'));
                setActiveChild(child);
                switchTab('records');
                showToast(`Opened folder for "${child.name}"`);
            });
        });

        // Wire Conduct Assessment buttons on individual cards
        cardsContainer.querySelectorAll('.btn-conduct-form').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const formId = btn.getAttribute('data-form');
                const child = JSON.parse(btn.getAttribute('data-child-json'));
                setActiveChild(child);
                switchTab(formId);
                showToast(`Starting ${cleanLabel(formId)} for "${child.name}"`);
            });
        });

        // Wire View Form buttons
        cardsContainer.querySelectorAll('.btn-summary-view-form').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                viewRecord(id);
            });
        });

        // Wire Matrix table actions
        matrixTbody.querySelectorAll('.btn-matrix-view-dossier').forEach(btn => {
            btn.addEventListener('click', () => {
                const child = JSON.parse(btn.getAttribute('data-child-json'));
                const fullChild = allSummaryChildrenList.find(c => c.id === child.id) || child;
                openChildSummaryModal(fullChild);
            });
        });

        matrixTbody.querySelectorAll('.btn-matrix-export-pdf').forEach(btn => {
            btn.addEventListener('click', () => {
                const child = JSON.parse(btn.getAttribute('data-child-json'));
                const fullChild = allSummaryChildrenList.find(c => c.id === child.id) || child;
                generateChildSummaryPdf(fullChild, fullChild.assessments || []);
            });
        });
    }

    // ── Open Child Assessment Summary Modal (Full Multi-Disciplinary Dossier) ───
    async function openChildSummaryModal(child, fromMatrix = false) {
        if (!child) return;
        childSummaryOpenedFromMatrix = !!fromMatrix;
        const modal = document.getElementById('child-summary-modal');
        if (!modal) return;

        // AUTOMATICALLY CLOSE the Center-Wide Matrix Modal if open so summary is shown cleanly in front
        const allModal = document.getElementById('all-summary-modal');
        if (allModal) {
            allModal.classList.remove('show');
        }

        // Show/hide "← Back to Matrix" button depending on whether opened from matrix
        const backBtn = document.getElementById('btn-back-to-matrix');
        if (backBtn) {
            backBtn.style.display = fromMatrix ? 'inline-flex' : 'none';
        }

        const nameEl = document.getElementById('child-summary-name');
        const subEl = document.getElementById('child-summary-subtitle');
        const kpisEl = document.getElementById('child-summary-kpis');
        const domainsEl = document.getElementById('child-summary-domains-badges');
        const detailsEl = document.getElementById('child-summary-details-list');

        const ageYears = extractChildAge(child);
        const ageStr = ageYears ? `${ageYears} yrs` : (child.dob ? `DOB: ${child.dob}` : 'Age not specified');
        const admBadge = child.admission_no ? ` · ${child.admission_no}` : '';
        
        nameEl.textContent = `Clinical Assessment Summary — ${child.name}`;
        subEl.textContent = `${child.sex || 'Child'} · ${ageStr} · Mobile: ${child.mobile || 'None'} · ID: #${child.id}${admBadge}`;

        kpisEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 15px; color: var(--text-light);">Loading assessment history...</div>';
        domainsEl.innerHTML = '';
        detailsEl.innerHTML = '';
        modal.classList.add('show');
        modal.classList.remove('hidden');

        try {
            const res = await fetch(`/api/children/${child.id}`);
            let childData = child;
            let assessments = [];
            if (res.ok) {
                childData = await res.json();
                assessments = childData.assessments || [];
                if (childData.admission_no && !subEl.textContent.includes(childData.admission_no)) {
                    subEl.textContent += ` · ${childData.admission_no}`;
                }
            } else {
                const aRes = await fetch(`/api/assessments?child_id=${child.id}`);
                if (aRes.ok) assessments = await aRes.json();
            }

            currentSummaryChild = childData;
            currentSummaryAssessments = assessments;

            const summary = extractAssessmentSummaries(childData, assessments);

            // 0. Render Germany Official Summary Sheet by default
            const sheetContainer = document.getElementById('child-summary-sheet-container');
            if (sheetContainer) {
                sheetContainer.innerHTML = renderChildSummarySheetHtml(childData, assessments);
            }

            // Ensure tab 1 (Summary Sheet) is active by default
            const tabSheet = document.getElementById('tab-child-summary-sheet');
            const tabDossier = document.getElementById('tab-child-summary-dossier');
            const viewSheet = document.getElementById('child-summary-sheet-view');
            const viewDossier = document.getElementById('child-summary-dossier-view');

            if (tabSheet && tabDossier && viewSheet && viewDossier) {
                tabSheet.classList.add('active');
                tabDossier.classList.remove('active');
                viewSheet.classList.remove('hidden');
                viewSheet.style.display = 'block';
                viewDossier.classList.add('hidden');
                viewDossier.style.display = 'none';
            }

            // 1. Render Top KPI Badges
            kpisEl.innerHTML = `
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #1e40af; text-transform: uppercase;">Total Assessments</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: #1d4ed8; margin-top: 3px;">${summary.totalCount}</div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">Records in dossier</div>
                </div>
                <div style="background: ${summary.coreCount === 4 ? '#f0fdf4' : '#fefce8'}; border: 1px solid ${summary.coreCount === 4 ? '#bbf7d0' : '#fef08a'}; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: ${summary.coreCount === 4 ? '#166534' : '#854d0e'}; text-transform: uppercase;">Workup Status</div>
                    <div style="font-size: 1.15rem; font-weight: 700; color: ${summary.coreCount === 4 ? '#15803d' : '#a16207'}; margin-top: 4px;">${summary.coreCount === 4 ? 'Fully Assessed' : `${summary.coreCount}/4 Disciplines`}</div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">${summary.coreCount === 4 ? 'All Core Forms Done' : 'Pending Evaluations'}</div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #475569; text-transform: uppercase;">Primary Diagnosis</div>
                    <div style="font-size: 0.88rem; font-weight: 700; color: #1e3a8a; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${summary.rapid.diagnosis}">
                        ${summary.rapid.diagnosis || summary.dev.diagnosis || 'Provisional'}
                    </div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">Clinical impression</div>
                </div>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 0.75rem; font-weight: 600; color: #475569; text-transform: uppercase;">Quarterly Reviews</div>
                    <div style="font-size: 1.15rem; font-weight: 700; color: #1e293b; margin-top: 4px;">${summary.progress.length} Review(s)</div>
                    <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">Goal progression</div>
                </div>
            `;

            // 2. Render Discipline Pills
            const domainDefinitions = [
                { type: 'Consultation Form', label: 'Consultation Form', icon: '🩺', record: summary.rapid.exists ? summary.rapid : null },
                { type: 'Child Development', label: 'Child Development', icon: '👶', record: summary.dev.exists ? summary.dev : null },
                { type: 'Physiotherapy', label: 'Physiotherapy', icon: '💪', record: summary.physio.exists ? summary.physio : null },
                { type: 'Speech Assessment', label: 'Speech Assessment', icon: '🗣️', record: summary.speech.exists ? summary.speech : null },
                { type: 'Quarterly Progress Review', label: `Quarterly Reviews (${summary.progress.length})`, icon: '📈', record: summary.progress.length ? summary.progress[0] : null }
            ];

            domainsEl.innerHTML = domainDefinitions.map(d => {
                if (d.record) {
                    return `<span class="discipline-pill done" style="font-size: 0.82rem; padding: 4px 10px;">
                        ${d.icon} <span>${d.label}</span> <span style="font-size: 0.75rem; background: #bbf7d0; padding: 1px 6px; border-radius: 10px;">✓ ${d.record.date || 'Done'}</span>
                    </span>`;
                } else {
                    return `<span class="discipline-pill pending" style="font-size: 0.82rem; padding: 4px 10px;">
                        ${d.icon} <span>${d.label}</span> <span style="font-size: 0.75rem;">(Pending)</span>
                    </span>`;
                }
            }).join('');

            // 3. Render Every Assessment Form Together!
            detailsEl.innerHTML = renderChildConsolidatedCardHtml(childData, assessments, true);

            // Wire view form buttons
            detailsEl.querySelectorAll('.btn-summary-view-form').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    viewRecord(id);
                });
            });

            // Wire conduct form buttons
            detailsEl.querySelectorAll('.btn-conduct-form').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const formId = btn.getAttribute('data-form');
                    modal.classList.remove('show');
                    setActiveChild(childData);
                    switchTab(formId);
                    showToast(`Opening ${cleanLabel(formId)} for "${childData.name}"`);
                });
            });

        } catch (err) {
            console.error('Error opening child summary modal:', err);
            detailsEl.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Failed to load clinical assessment dossier.</div>';
        }
    }

    // ── Center-Wide Assessment Summary Matrix Modal ─────────────────────────
    async function openAllAssessmentsSummaryModal() {
        const modal = document.getElementById('all-summary-modal');
        if (!modal) return;

        const tbody = document.getElementById('all-summary-tbody');
        const kpisEl = document.getElementById('all-summary-kpis');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 25px; color: var(--text-light);">Loading center assessment records...</td></tr>';
        if (kpisEl) kpisEl.innerHTML = '';
        modal.classList.add('show');
        modal.classList.remove('hidden');

        try {
            const res = await fetch('/api/children' + ((userRole === 'autism' || userRole === 'asd') ? '?autism=true' : ''));
            if (!res.ok) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger); padding: 20px;">Failed to load child records</td></tr>';
                return;
            }
            const allChildren = await res.json();
            
            // Filter by active role permissions
            const filteredChildren = allChildren.filter(c => matchesAgeFilter(c));
            allSummaryChildrenList = filteredChildren;

            // Compute KPIs
            const totalChildren = filteredChildren.length;
            let fullyAssessed = 0;
            let partiallyAssessed = 0;
            let noneAssessed = 0;
            let totalAssessments = 0;

            filteredChildren.forEach(c => {
                const aList = c.assessments || [];
                totalAssessments += aList.length;
                const hasRapid = aList.some(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment');
                const hasDev = aList.some(a => a.form_type === 'Child Development');
                const hasPhysio = aList.some(a => a.form_type === 'Physiotherapy');
                const hasSpeech = aList.some(a => a.form_type === 'Speech Assessment');
                const majorDone = [hasRapid, hasDev, hasPhysio, hasSpeech].filter(Boolean).length;

                if (majorDone === 4) fullyAssessed++;
                else if (aList.length > 0) partiallyAssessed++;
                else noneAssessed++;
            });

            if (kpisEl) {
                kpisEl.innerHTML = `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: #475569; text-transform: uppercase;">Total Registered Children</div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #1e293b; margin-top: 3px;">${totalChildren}</div>
                    </div>
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: #166534; text-transform: uppercase;">Fully Assessed (4/4 Core)</div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #15803d; margin-top: 3px;">${fullyAssessed}</div>
                    </div>
                    <div style="background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: #854d0e; text-transform: uppercase;">Partially Assessed (1-3)</div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #a16207; margin-top: 3px;">${partiallyAssessed}</div>
                    </div>
                    <div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: #991b1b; text-transform: uppercase;">Needs Initial Assessment (0)</div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #b91c1c; margin-top: 3px;">${noneAssessed}</div>
                    </div>
                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
                        <div style="font-size: 0.72rem; font-weight: 700; color: #1e40af; text-transform: uppercase;">Total Assessments Done</div>
                        <div style="font-size: 1.45rem; font-weight: 700; color: #1d4ed8; margin-top: 3px;">${totalAssessments}</div>
                    </div>
                `;
            }

            renderAllSummaryTable(allSummaryChildrenList);

            // Live filter and search handlers
            const searchInput = document.getElementById('all-summary-search');
            const filterSelect = document.getElementById('all-summary-filter');

            const handleFilterChange = () => {
                const q = (searchInput?.value || '').toLowerCase().trim();
                const f = filterSelect?.value || 'all';

                let list = allSummaryChildrenList;
                if (q) {
                    list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
                }

                if (f === 'completed') {
                    list = list.filter(c => {
                        const aList = c.assessments || [];
                        return ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => aList.some(a => a.form_type === t));
                    });
                } else if (f === 'partial') {
                    list = list.filter(c => {
                        const aList = c.assessments || [];
                        const majorDone = ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => aList.some(a => a.form_type === t)).length;
                        return majorDone > 0 && majorDone < 4;
                    });
                } else if (f === 'none') {
                    list = list.filter(c => (!c.assessments || c.assessments.length === 0));
                } else if (f === 'missing-consultation' || f === 'missing-rapid') {
                    list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Consultation Form' || a.form_type === 'Rapid Assessment')));
                } else if (f === 'missing-dev') {
                    list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Child Development')));
                } else if (f === 'missing-physio') {
                    list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Physiotherapy')));
                } else if (f === 'missing-speech') {
                    list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Speech Assessment')));
                }

                renderAllSummaryTable(list);
            };

            if (searchInput) searchInput.oninput = handleFilterChange;
            // Wire Tabs in All Summary Modal
            const tabMatrix = document.getElementById('tab-all-summary-matrix');
            const tabSheets = document.getElementById('tab-all-summary-sheets');
            const viewMatrix = document.getElementById('all-summary-matrix-view');
            const viewSheets = document.getElementById('all-summary-sheets-view');
            const childPicker = document.getElementById('all-summary-child-picker');
            const sheetRender = document.getElementById('all-summary-sheet-render');
            let activeSheetChild = null;

            const updateActiveSheet = async (child) => {
                if (!child || !sheetRender) return;
                activeSheetChild = child;
                sheetRender.innerHTML = '<div style="text-align: center; padding: 25px; color: var(--text-light);">Loading child assessment sheet...</div>';
                try {
                    let fullChild = child;
                    const res = await fetch(`/api/children/${child.id}`);
                    if (res.ok) fullChild = await res.json();
                    activeSheetChild = fullChild;
                    sheetRender.innerHTML = renderChildSummarySheetHtml(fullChild, fullChild.assessments || []);
                } catch (e) {
                    sheetRender.innerHTML = renderChildSummarySheetHtml(child, child.assessments || []);
                }
            };

            if (tabMatrix && tabSheets && viewMatrix && viewSheets) {
                tabMatrix.onclick = () => {
                    tabMatrix.classList.add('active');
                    tabSheets.classList.remove('active');
                    viewMatrix.classList.remove('hidden');
                    viewMatrix.style.display = 'block';
                    viewSheets.classList.add('hidden');
                    viewSheets.style.display = 'none';
                };

                tabSheets.onclick = () => {
                    tabSheets.classList.add('active');
                    tabMatrix.classList.remove('active');
                    viewSheets.classList.remove('hidden');
                    viewSheets.style.display = 'block';
                    viewMatrix.classList.add('hidden');
                    viewMatrix.style.display = 'none';

                    if (childPicker) {
                        childPicker.innerHTML = allSummaryChildrenList.map(c => 
                            `<option value="${c.id}">${c.name} (${c.admission_no || '#' + c.id})</option>`
                        ).join('');

                        if (allSummaryChildrenList.length > 0) {
                            childPicker.value = allSummaryChildrenList[0].id;
                            updateActiveSheet(allSummaryChildrenList[0]);
                        } else {
                            sheetRender.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">No children records available.</div>';
                        }

                        childPicker.onchange = () => {
                            const selectedId = childPicker.value;
                            const found = allSummaryChildrenList.find(c => String(c.id) === String(selectedId));
                            if (found) updateActiveSheet(found);
                        };
                    }
                };
            }

            document.getElementById('btn-print-active-sheet')?.addEventListener('click', () => {
                if (activeSheetChild) {
                    printChildSummarySheet(activeSheetChild, activeSheetChild.assessments || []);
                } else if (allSummaryChildrenList.length > 0) {
                    printChildSummarySheet(allSummaryChildrenList[0], allSummaryChildrenList[0].assessments || []);
                }
            });

            document.getElementById('btn-pdf-active-sheet')?.addEventListener('click', () => {
                if (activeSheetChild) {
                    generateChildSummaryPdf(activeSheetChild, activeSheetChild.assessments || []);
                } else if (allSummaryChildrenList.length > 0) {
                    generateChildSummaryPdf(allSummaryChildrenList[0], allSummaryChildrenList[0].assessments || []);
                }
            });

            // Modal Export handlers
            const btnPdf = document.getElementById('btn-export-all-summary-pdf');
            if (btnPdf) btnPdf.onclick = () => generateAllAssessmentsSummaryPdf(allSummaryChildrenList);
            const btnCsv = document.getElementById('btn-export-all-summary-csv');
            if (btnCsv) btnCsv.onclick = () => exportAllAssessmentsSummaryCsv(allSummaryChildrenList);

        } catch (err) {
            console.error('Error opening all assessments summary:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--danger); padding: 20px;">Error loading assessment matrix</td></tr>';
        }
    }

    function renderAllSummaryTable(children) {
        const tbody = document.getElementById('all-summary-tbody');
        if (!tbody) return;

        if (!children.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 25px; color: var(--text-light);">No child records match current filters.</td></tr>';
            return;
        }

        tbody.innerHTML = children.map(c => {
            const ageYears = extractChildAge(c);
            const ageStr = extractChildAgeString(c);
            const aList = c.assessments || [];

            const renderBadge = (formType) => {
                const match = aList.find(a => a.form_type === formType || (formType === 'Consultation Form' && a.form_type === 'Rapid Assessment'));
                if (match) {
                    const dt = match.created_at ? new Date(match.created_at).toLocaleDateString('en-IN') : 'Done';
                    return `<span style="background: #dcfce7; color: #15803d; padding: 3px 8px; border-radius: 12px; font-weight: 600; font-size: 0.76rem;" title="Completed on ${dt}">✓ ${dt}</span>`;
                }
                return '<span style="color: #cbd5e1; font-size: 0.85rem;" title="Not done">—</span>';
            };

            const progressMatches = aList.filter(a => a.form_type === 'Quarterly Progress Review');
            const progressBadge = progressMatches.length
                ? `<span style="background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 12px; font-weight: 600; font-size: 0.76rem;">${progressMatches.length} review(s)</span>`
                : '<span style="color: #cbd5e1; font-size: 0.85rem;">—</span>';

            const totalBadge = `<span style="font-weight: 700; color: ${aList.length >= 4 ? '#15803d' : (aList.length > 0 ? '#b45309' : '#dc2626')};">${aList.length}</span>`;

            const admBadge = c.admission_no ? `<div style="font-size: 0.73rem; color: #0284c7; font-weight: 600;">${c.admission_no}</div>` : '';
            const safeChildJson = JSON.stringify({ id: c.id, name: c.name, admission_no: c.admission_no, dob: c.dob, sex: c.sex, mobile: c.mobile }).replace(/"/g, '&quot;');

            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 12px;"><strong>${c.name}</strong>${admBadge}</td>
                    <td style="padding: 10px 12px; color: #64748b; font-size: 0.82rem;">${ageStr} / ${c.sex || '-'}</td>
                    <td style="padding: 10px 12px; text-align: center;">${renderBadge('Consultation Form')}</td>
                    <td style="padding: 10px 12px; text-align: center;">${renderBadge('Child Development')}</td>
                    <td style="padding: 10px 12px; text-align: center;">${renderBadge('Physiotherapy')}</td>
                    <td style="padding: 10px 12px; text-align: center;">${renderBadge('Speech Assessment')}</td>
                    <td style="padding: 10px 12px; text-align: center;">${progressBadge}</td>
                    <td style="padding: 10px 12px; text-align: center;">${totalBadge}</td>
                    <td style="padding: 10px 12px; text-align: center;">
                        <button class="btn-summary-table-view btn-secondary btn-sm" data-child-json="${safeChildJson}" style="padding: 3px 8px; font-size: 0.78rem; font-weight: 600; background: #f0fdf4; color: #166534; border-color: #86efac; cursor: pointer;">📋 View Summary</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Wire View Summary button: AUTOMATICALLY CLOSES All Children Matrix modal and displays Child Summary modal
        tbody.querySelectorAll('.btn-summary-table-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                
                // 1. Immediately close the All Children Matrix Modal
                const allModal = document.getElementById('all-summary-modal');
                if (allModal) {
                    allModal.classList.remove('show');
                }

                // 2. Open the Child's clinical assessment summary modal
                openChildSummaryModal(cd, true);
            });
        });
    }

        // ── Helper: Build Official Germany Summary Sheet PDF for a single child ──────
    function buildChildSummaryPdfDocument(doc, child, assessments = [], startOnNewPage = false) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 12;

        if (startOnNewPage) {
            doc.addPage();
        }

        const startY = 8;
        // Brand Header Banner
        doc.setFillColor(30, 58, 138); // Deep Navy
        doc.rect(margin, startY, pageWidth - (margin * 2), 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 58, 138);
        doc.text('EARLY INTERVENTION CENTRE FOR CHILDREN WITH CEREBRAL PALSY Mylaudy', pageWidth / 2, startY + 6, { align: 'center' });

        doc.setFontSize(12.5);
        doc.setTextColor(15, 23, 42);
        doc.text('CHILD SUMMARY SHEET', pageWidth / 2, startY + 12, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text('Suggestions from Germany Team', pageWidth / 2, startY + 16.5, { align: 'center' });

        const f = getSummaryFields(child, assessments);

        // Table 0: Part 1 - Information Sheet & Developmental History
        const table0Body = [
            // Top Meta Row
            [
                { content: 'DATE OF ASSESSMENT', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.assessmentDate, styles: { fontStyle: 'bold', textColor: [30, 58, 138] } },
                { content: 'SL.NO', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.slNo, styles: { fontStyle: 'bold', textColor: [30, 58, 138] } }
            ],
            // Header: INFORMATION SHEET
            [{ content: 'INFORMATION SHEET', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Name', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.name, styles: { fontStyle: 'bold' } },
                { content: 'Sex', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.sex }
            ],
            [
                { content: 'Date of Birth', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.dob },
                { content: 'Age / Grade', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `${f.age} / Grade: ${f.grade}` }
            ],
            [
                { content: 'Address', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.address, colSpan: 3 }
            ],
            [
                { content: 'Anthropometry', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Height: ${f.height} cm  |  Weight: ${f.weight} kg  |  BMI: ${f.bmi}\nHead Circ: ${f.headCirc} cm  |  Chest: ${f.chestCirc} cm  |  MUAC: R(${f.muacR}) L(${f.muacL})`, colSpan: 3 }
            ],
            [
                { content: 'Consanguinity', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.consanguinity, colSpan: 3 }
            ],
            [
                { content: 'Siblings', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Brothers: ${f.siblingsBrothers} | Sisters: ${f.siblingsSisters} | Total: ${f.siblingsTotal}` },
                { content: 'Birth Order / Preg.', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Order: ${f.birthOrder} | Preg: ${f.pregnancies} | Deliv: ${f.deliveries}` }
            ],
            [
                { content: 'History of disability in family', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.disabilityInFamily, colSpan: 3 }
            ],

            // Pre-Natal History
            [{ content: 'PRE-NATAL HISTORY', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Health of mother during preg.', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.motherPregnancyHealth },
                { content: 'RH incompatibility', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.rhIncompatibility }
            ],
            [
                { content: 'Any infectious disease', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.pregnancyInfections, colSpan: 3 }
            ],

            // Peri-Natal History
            [{ content: 'PERI-NATAL HISTORY', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Type of delivery', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.deliveryType },
                { content: 'Place of delivery', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.deliveryPlace }
            ],
            [
                { content: 'Term', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `${f.deliveryTerm} ${f.prematureMonth ? `(${f.prematureMonth})` : ''}` },
                { content: 'Birth cry', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.birthCry }
            ],
            [
                { content: 'Birth weight', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.birthWeight },
                { content: 'Birth colour', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.birthColour }
            ],

            // Post Natal History
            [{ content: 'POST NATAL HISTORY', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Days stay in hospital', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.hospitalStayDays },
                { content: 'Incubator support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.incubatorSupport }
            ],
            [
                { content: 'Oxygens', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.oxygenSupport },
                { content: 'Fits / convulsions', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.convulsions }
            ],
            [
                { content: 'Any major surgery', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.majorSurgeries, colSpan: 3 }
            ],

            // Known Diagnosis
            [{ content: 'KNOWN DIAGNOSIS', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Cerebral Palsy', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.knownCp },
                { content: 'Genetic disorder', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.knownGenetic }
            ],
            [
                { content: 'Unknown underlying disease', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.knownUnknownDisease },
                { content: 'Clinical Impression', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.diagnosis, styles: { fontStyle: 'bold', textColor: [30, 58, 138] } }
            ],

            // Cognitive Development
            [{ content: 'COGNITIVE DEVELOPMENT', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Cognitive Delay', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Speech: ${f.speechDelay}  |  Schooling: ${f.schoolingDelay}`, colSpan: 3 }
            ],
            [
                { content: 'Social smile < 3 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msSmile },
                { content: 'Babbling < 5 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msBabbling }
            ],
            [
                { content: 'Eye contact < 3 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msEyeContact },
                { content: 'Words < 12 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msWords }
            ],
            [
                { content: 'Sentences < 24 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msSentences, colSpan: 3 }
            ],

            // Developmental Delay and Disability
            [{ content: 'DEVELOPMENTAL DELAY AND DISABILITY', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Vision Impairment', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.visionImpairment },
                { content: 'Hearing impairment', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.hearingImpairment }
            ],
            [
                { content: 'Neuro-motor impairment', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.neuromotorImpairment, colSpan: 3 }
            ],

            // Objectives
            [{ content: 'OBJECTIVES', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Previous reports from doctors', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.doctorReports, colSpan: 3 }
            ],
            [
                { content: 'Previous reports from imaging', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.imagingReports, colSpan: 3 }
            ],
            [
                { content: 'Previous therapies', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.previousTherapies, colSpan: 3 }
            ],
            [
                { content: 'Expectations of the parents', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.parentExpectations, colSpan: 3, styles: { fontStyle: 'bold', textColor: [30, 58, 138] } }
            ]
        ];

        doc.autoTable({
            startY: startY + 19,
            head: [[{ content: 'PART 1: INFORMATION SHEET & DEVELOPMENTAL HISTORY', colSpan: 4, styles: { halign: 'left', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 } }]],
            body: table0Body,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.6, textColor: [15, 23, 42], overflow: 'linebreak' },
            columnStyles: {
                0: { width: 44 },
                1: { width: 48 },
                2: { width: 44 },
                3: { width: 50 }
            },
            margin: { left: margin, right: margin }
        });

        // Table 1: Part 2 - Physiotherapy Assessment & Functional Evaluation
        const table1Body = [
            // Motor Milestones
            [{ content: 'MOTOR MILESTONES', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Sitting < 8 months', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msSitting },
                { content: 'Crawling < 10 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msCrawling }
            ],
            [
                { content: 'Standing < 14 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msStanding },
                { content: 'Walking < 18 m', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.msWalking }
            ],
            [
                { content: 'Use of aids', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.useOfAids, colSpan: 3 }
            ],

            // Visible Deformity
            [{ content: 'VISIBLE DEFORMITY', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Knock knees', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.knockKneesR} | Lt: ${f.knockKneesL}` },
                { content: 'Bow legs', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.bowLegsR} | Lt: ${f.bowLegsL}` }
            ],
            [
                { content: 'Flat foot', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.flatFootR} | Lt: ${f.flatFootL}` },
                { content: 'Equines', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.equinesR} | Lt: ${f.equinesL}` }
            ],
            [
                { content: 'Elbow deformity', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.elbowDefR} | Lt: ${f.elbowDefL}` },
                { content: 'Hand deformity', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.handDefR} | Lt: ${f.handDefL}` }
            ],
            [
                { content: 'Others', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.deformityOthers, colSpan: 3 }
            ],

            // Impairment of Body Structure
            [{ content: 'IMPAIRMENT OF BODY STRUCTURE', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Scoliosis', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.scoliosis },
                { content: 'Kyphosis', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.kyphosis }
            ],
            [
                { content: 'Hyper lordosis', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.hyperLordosis },
                { content: 'Others', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.impairmentOthers }
            ],

            // Gross Motor
            [{ content: 'GROSS MOTOR', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Head control', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmHeadControl },
                { content: 'Sitting with support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmSitSupport }
            ],
            [
                { content: 'Rolling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmRolling },
                { content: 'Sitting without support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmSitNoSupport }
            ],
            [
                { content: 'Alternating crawling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmAltCrawling },
                { content: '4 point kneeling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gm4PointKneel }
            ],
            [
                { content: 'Bunny hopping', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmBunnyHopping },
                { content: '2 point kneeling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gm2PointKneel }
            ],
            [
                { content: 'Half kneeling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmHalfKneel },
                { content: 'Standing without support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStandNoSupport }
            ],
            [
                { content: 'Standing with support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStandSupport },
                { content: 'Standing on tip toes', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStandTiptoes }
            ],
            [
                { content: 'Standing on heels', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStandHeels },
                { content: 'Jumping on one leg', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmJumpOneLeg }
            ],
            [
                { content: 'Standing on one leg', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStandOneLeg },
                { content: 'Jumping on two legs', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmJumpTwoLegs }
            ],
            [
                { content: 'Stair climbing with support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStairSupport },
                { content: 'Running regular', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmRunningRegular }
            ],
            [
                { content: 'Stair climbing without supp.', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmStairNoSupport },
                { content: 'Running Issues', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gmRunningIssues }
            ],

            // Transitions without support
            [{ content: 'TRANSITION WITHOUT SUPPORT', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Supine - prone - sitting', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trSupineProneSit },
                { content: 'Prone - supine - rolling', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trProneSupineRoll }
            ],
            [
                { content: 'Sitting with support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trSitSupport },
                { content: 'Sitting without support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trSitNoSupport }
            ],
            [
                { content: 'Sitting - Standing', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trSitStand },
                { content: 'Standing - Sitting', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trStandSit }
            ],
            [
                { content: 'Crawl - Kneel - Half kneel - Stand', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trCrawlKneelStand },
                { content: 'Stand - Half kneel - Kneel - Crawl', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trStandKneelCrawl }
            ],
            [
                { content: 'Quadruped - side sitting', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.trQuadSideSit, colSpan: 3 }
            ],

            // Gait Patterns
            [{ content: 'GAIT PATTERNS', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Without support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gaitWithoutSupport },
                { content: 'With support', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gaitWithSupport }
            ],
            [
                { content: 'No walk', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gaitNoWalk, colSpan: 3 }
            ],
            [
                { content: 'Gait pattern details', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.gaitPattern, colSpan: 3 }
            ],

            // ROM Passive & Active
            [{ content: 'JOINT RANGE OF MOTION (ROM) PASSIVE & ACTIVE', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Hip ROM (Passive)', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Horiz: R(${f.romHipHorizR}) L(${f.romHipHorizL}) | Vert: R(${f.romHipVertR}) L(${f.romHipVertL})\nFlex/Ext: R(${f.romHipFlexR}) L(${f.romHipFlexL}) | Rot: R(${f.romHipRotR}) L(${f.romHipRotL})`, colSpan: 3 }
            ],
            [
                { content: 'Hip ROM (Active)', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Flex/Ext: R(${f.romActHipFlexR}) L(${f.romActHipFlexL}) | Rot: R(${f.romActHipRotR}) L(${f.romActHipRotL})`, colSpan: 3 }
            ],
            [
                { content: 'Knee & Ankle ROM', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Knee Pass: R(${f.romKneeFlexR}) L(${f.romKneeFlexL}) | Knee Act: R(${f.romActKneeFlexR}) L(${f.romActKneeFlexL})\nAnkle Bended: R(${f.romAnkleBendR}) L(${f.romAnkleBendL}) | Straight: R(${f.romAnkleStrR}) L(${f.romAnkleStrL})`, colSpan: 3 }
            ],
            [
                { content: 'Upper Limb ROM', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Elbow Flex/Ext: R(${f.romElbowFlexR}) L(${f.romElbowFlexL}) | Hand/Wrist: R(${f.romHandR}) L(${f.romHandL})`, colSpan: 3 }
            ],

            // Muscle Strength
            [{ content: 'MUSCLE STRENGTH (1/5 - 5/5)', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Hip / Knee / Ankle', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Hip: R(${f.strHipR}) L(${f.strHipL}) | Knee: R(${f.strKneeR}) L(${f.strKneeL}) | Ankle: R(${f.strAnkleR}) L(${f.strAnkleL})`, colSpan: 3 }
            ],
            [
                { content: 'Shoulder / Elbow / Wrist', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Shoulder: R(${f.strShoulderR}) L(${f.strShoulderL}) | Elbow: R(${f.strElbowR}) L(${f.strElbowL}) | Wrist: R(${f.strWristR}) L(${f.strWristL})`, colSpan: 3 }
            ],

            // Neurological & Reflexes
            [{ content: 'NEUROLOGICAL & REFLEXES', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Muscle tone in general', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.muscleToneGeneral },
                { content: 'Clonus', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.clonus }
            ],
            [
                { content: 'Patellar reflex', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.reflexPatellarR} | Lt: ${f.reflexPatellarL}` },
                { content: 'Achilles reflex', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.reflexAchillesR} | Lt: ${f.reflexAchillesL}` }
            ],
            [
                { content: 'Babinski reflex', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.reflexBabinskiR} | Lt: ${f.reflexBabinskiL}` },
                { content: 'Limb length meas.', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Rt: ${f.limbLengthR} | Lt: ${f.limbLengthL}` }
            ],
            [
                { content: 'Co-ordination', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Able to cross midline: ${f.coordinationMidline}` },
                { content: 'Fine Motor Assessment', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: `Pinch: ${f.fineMotorPinch} | Pro/sup: ${f.fineMotorSupination}` }
            ],
            [
                { content: 'Other comments', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.physioOtherComments, colSpan: 3 }
            ],

            // Treatment Plan (Individual rows from SUMMARY SHEET.docx)
            [{ content: 'TREATMENT PLAN', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Head control', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpHeadControl },
                { content: 'Trunk control', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpTrunkControl }
            ],
            [
                { content: 'Sitting position', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpSitting },
                { content: 'Standing position', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpStanding }
            ],
            [
                { content: 'Side steps', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpSideSteps },
                { content: 'Walking with aids', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpWalkingAids }
            ],
            [
                { content: 'Free walking gait pattern', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.tpFreeWalking, colSpan: 3, styles: { fontStyle: 'bold', textColor: [30, 58, 138] } }
            ],

            // External Devices (Individual rows from SUMMARY SHEET.docx)
            [{ content: 'EXTERNAL DEVICES', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: 'Splints', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.devSplints },
                { content: 'CP chair', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.devCpChair }
            ],
            [
                { content: 'Standing frame', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.devStandingFrame },
                { content: 'Wheel Chair', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.devWheelchair }
            ],
            [
                { content: 'Walker', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.devWalker, colSpan: 3 }
            ],

            // Further Investigations Needed
            [{ content: 'FURTHER INVESTIGATIONS NEEDED', colSpan: 4, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: [15, 23, 42] } }],
            [
                { content: '(Sree Chitra, General pediatrician, German therapist, German doctors)', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
                { content: f.furtherInvestigations, colSpan: 3, styles: { fontStyle: 'bold', textColor: [15, 23, 42] } }
            ]
        ];

        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 5,
            head: [[{ content: 'PART 2: PHYSIOTHERAPY ASSESSMENT & FUNCTIONAL EVALUATION', colSpan: 4, styles: { halign: 'left', fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 } }]],
            body: table1Body,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.6, textColor: [15, 23, 42], overflow: 'linebreak' },
            columnStyles: {
                0: { width: 44 },
                1: { width: 48 },
                2: { width: 44 },
                3: { width: 50 }
            },
            margin: { left: margin, right: margin }
        });

        // Clinician Signatures Block
        let sigY = doc.lastAutoTable.finalY + 12;
        if (sigY + 24 > pageHeight - 12) {
            doc.addPage();
            sigY = 20;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text('Physiotherapist / German Team Signatures:', margin, sigY);
        doc.text('Clinical Director / Authorized Signatory:', pageWidth - margin - 60, sigY);

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, sigY + 10, margin + 55, sigY + 10);
        doc.line(pageWidth - margin - 60, sigY + 10, pageWidth - margin, sigY + 10);

        doc.setFontSize(7);
        doc.text('Evaluating Clinician & Date', margin, sigY + 14);
        doc.text('CORC Centre Seal & In-Charge', pageWidth - margin - 60, sigY + 14);
    }

    // ── Generate Single Child Official Germany Summary Sheet PDF ──────────────────
    function generateChildSummaryPdf(child, assessments = []) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator is initializing, please try again in a moment', true);
            return;
        }

        try {
            const doc = new window.jspdf.jsPDF('portrait', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            buildChildSummaryPdfDocument(doc, child, assessments, false);

            // Add Header/Footer to each page
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
                doc.text('CORC Early Intervention Centre Mylaudy - Child Summary Sheet (Suggestions from Germany Team)', margin, pageHeight - 5);
            }

            const cleanName = (child.name || 'Child').replace(/[^a-zA-Z0-9]/g, '_');
            const adm = (child.admission_no || `ID_${child.id}`).replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `Summary_Sheet_${adm}_${cleanName}.pdf`;
            saveAndOpenPdf(doc, filename);
            showToast('Official Germany Summary Sheet PDF generated and downloaded!');
        } catch (err) {
            console.error('PDF generation error:', err);
            showToast('Error generating summary PDF', true);
        }
    }

    // ── Generate Official Germany Summary Sheet PDF for ALL Children (Sequential Sheets) ──
    function generateAllAssessmentsSummaryPdf(children = []) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator is initializing, please try again in a moment', true);
            return;
        }

        if (!children || !children.length) {
            showToast('No children found to export', true);
            return;
        }

        try {
            showToast(`Generating official Summary Sheets for all ${children.length} children...`);
            const doc = new window.jspdf.jsPDF('portrait', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            // Render each child\'s full Summary Sheet (Table 0 and Table 1) sequentially
            children.forEach((c, idx) => {
                buildChildSummaryPdfDocument(doc, c, c.assessments || [], idx > 0);
            });

            // Add Page numbering to each page
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
                doc.text('CORC Early Intervention Centre Mylaudy - Child Summary Sheet Dossier (Suggestions from Germany Team)', margin, pageHeight - 5);
            }

            saveAndOpenPdf(doc, 'All_Children_Summary_Sheets_Germany_Format.pdf');
            showToast(`Official Germany Summary Sheets PDF generated for all ${children.length} children!`);
        } catch (err) {
            console.error('Error generating all summary sheets PDF:', err);
            showToast('Error generating summary sheets PDF', true);
        }
    }

    // ── Generate Center-Wide Summary Overview Grid PDF (Cross-Sectional Matrix) ───
    function generateOverviewGridPdf(children = []) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator is initializing, please try again in a moment', true);
            return;
        }

        try {
            const doc = new window.jspdf.jsPDF('landscape', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;

            // Brand Header
            doc.setFillColor(30, 58, 138);
            doc.rect(margin, 8, pageWidth - (margin * 2), 2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(30, 58, 138);
            doc.text('CHITRA ORTHO & REHAB CLINIC - CHILD DEVELOPMENT & EARLY INTERVENTION CENTRE', pageWidth / 2, 14, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            doc.text(`Center-Wide Multi-Disciplinary Assessment Summary Report | Generated: ${new Date().toLocaleDateString('en-IN')} | Total Children: ${children.length}`, pageWidth / 2, 19, { align: 'center' });

            const tableBody = children.map((c, idx) => {
                const ageYears = extractChildAge(c);
                const ageStr = extractChildAgeString(c);
                const summary = extractAssessmentSummaries(c, c.assessments || []);

                const rapidTxt = summary.rapid.exists ? `${summary.rapid.diagnosis}\n(Date: ${summary.rapid.date})` : '-';
                const devTxt = summary.dev.exists ? `${summary.dev.diagnosis}\n(Date: ${summary.dev.date})` : '-';
                const physioTxt = summary.physio.exists ? `${summary.physio.diagnosis}\n(Date: ${summary.physio.date})` : '-';
                const speechTxt = summary.speech.exists ? `${summary.speech.diagnosis}\n(Date: ${summary.speech.date})` : '-';
                const progTxt = summary.progress.length ? `${summary.progress[0].quarter}: ${summary.progress[0].achievement.slice(0, 35)}...` : '-';

                const statusTxt = summary.coreCount === 4 ? 'Complete (4/4)' : (summary.totalCount > 0 ? `Partial (${summary.coreCount}/4)` : 'Pending (0)');
                const admLine = c.admission_no ? `EIC: ${c.admission_no}\n` : '';

                return [
                    (idx + 1).toString(),
                    `${c.name}\n${admLine}(${ageStr}/${c.sex || '-'})`,
                    rapidTxt,
                    devTxt,
                    physioTxt,
                    speechTxt,
                    progTxt,
                    statusTxt
                ];
            });

            doc.autoTable({
                startY: 23,
                head: [['#', 'Child Name & Profile', 'Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment', 'Progress Reviews', 'Status']],
                body: tableBody,
                theme: 'striped',
                styles: { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], overflow: 'linebreak' },
                headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                columnStyles: {
                    0: { width: 8, halign: 'center' },
                    1: { width: 34, fontStyle: 'bold' },
                    2: { width: 44 },
                    3: { width: 44 },
                    4: { width: 44 },
                    5: { width: 44 },
                    6: { width: 35 },
                    7: { width: 20, halign: 'center' }
                },
                margin: { left: margin, right: margin },
                didDrawPage: (data) => {
                    doc.setFontSize(7.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
                    doc.text('Center-Wide Child Clinical Assessment Summary Dossier | Confidential Record', margin, pageHeight - 5);
                }
            });

            saveAndOpenPdf(doc, 'Center_Assessment_Overview_Grid.pdf');
            showToast('Center Assessment Overview Grid PDF generated successfully!');
        } catch (err) {
            console.error('Error generating center assessment PDF:', err);
            showToast('Error generating center assessment PDF', true);
        }
    }

// ── Export Center-Wide Summary CSV (All Children, All Forms Together) ─────
    function exportAllAssessmentsSummaryCsv(children = []) {
        if (!children || !children.length) {
            showToast('No child assessment records to export', true);
            return;
        }

        const headers = [
            'Child ID', 'Admission No', 'Child Name', 'Sex', 'DOB', 'Age (Years)', 'Mobile',
            'Workup Status', 'Total Assessments',
            'Consultation Date', 'Consultation Observations', 'Consultation Suggestions', 'Consultation Symptoms', 'Consultant Name',
            'Child Dev Date', 'Child Dev Diagnosis', 'Child Dev Chief Complaint', 'Child Dev Delays', 'Child Dev Treatment Goal',
            'Physiotherapy Date', 'Physiotherapy Diagnosis', 'Physio Gait & Mobility', 'Physio Tone', 'Physio Plan',
            'Speech Assessment Date', 'Speech Diagnosis', 'Speech Articulation', 'Speech Voice', 'Speech Plan',
            'Latest Progress Review Date', 'Progress Quarter', 'Progress Achievement', 'Progress Next Plan'
        ];

        const rows = children.map(c => {
            const ageYears = extractChildAge(c);
            const aList = c.assessments || [];
            const summary = extractAssessmentSummaries(c, aList);

            const r = summary.rapid;
            const d = summary.dev;
            const p = summary.physio;
            const s = summary.speech;
            const prog = summary.progress.length ? summary.progress[0] : {};

            return [
                c.id,
                `"${(c.admission_no || '').replace(/"/g, '""')}"`,
                `"${(c.name || '').replace(/"/g, '""')}"`,
                `"${c.sex || ''}"`,
                `"${c.dob || ''}"`,
                `"${(extractChildAgeString(c) || '').replace(/"/g, '""')}"`, 
                `"${c.mobile || ''}"`,
                `"${summary.workupStatus}"`,
                summary.totalCount,
                `"${r.date || ''}"`,
                `"${(r.diagnosis || '').replace(/"/g, '""')}"`,
                `"${(r.symptoms || '').replace(/"/g, '""')}"`,
                `"${(r.finalized_by || '').replace(/"/g, '""')}"`,
                `"${d.date || ''}"`,
                `"${(d.diagnosis || '').replace(/"/g, '""')}"`,
                `"${(d.chief_complaints || '').replace(/"/g, '""')}"`,
                `"${(d.delays.join('; ') || '').replace(/"/g, '""')}"`,
                `"${(d.goals || '').replace(/"/g, '""')}"`,
                `"${p.date || ''}"`,
                `"${(p.diagnosis || '').replace(/"/g, '""')}"`,
                `"${(p.gait || '').replace(/"/g, '""')}"`,
                `"${(p.tone || '').replace(/"/g, '""')}"`,
                `"${(p.plan || '').replace(/"/g, '""')}"`,
                `"${s.date || ''}"`,
                `"${(s.diagnosis || '').replace(/"/g, '""')}"`,
                `"${(s.articulation || '').replace(/"/g, '""')}"`,
                `"${(s.voice || '').replace(/"/g, '""')}"`,
                `"${(s.plan || '').replace(/"/g, '""')}"`,
                `"${prog.date || ''}"`,
                `"${(prog.quarter || '').replace(/"/g, '""')}"`,
                `"${(prog.achievement || '').replace(/"/g, '""')}"`,
                `"${(prog.next_plan || '').replace(/"/g, '""')}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Center_Assessment_Summaries_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Center assessment CSV exported successfully!');
    }

    // ── Global Event Wire-up for Assessment Summaries ───────────────────────
    // Sidebar & Records buttons
    document.getElementById('nav-assessment-summaries')?.addEventListener('click', () => {
        switchTab('assessment-summaries');
    });

    document.getElementById('btn-all-assessments-summary')?.addEventListener('click', () => {
        switchTab('assessment-summaries');
    });

    // Main Export Buttons in Assessment Summaries tab
    document.getElementById('btn-main-export-all-summary-pdf')?.addEventListener('click', () => {
        const searchInput = document.getElementById('main-summary-search');
        const statusFilter = document.getElementById('main-summary-status-filter');
        const ageFilter = document.getElementById('main-summary-age-filter');
        const q = (searchInput?.value || '').toLowerCase().trim();
        const sf = statusFilter?.value || 'all';
        const af = ageFilter?.value || 'all';

        let list = allSummaryChildrenList.filter(c => matchesAgeFilter(c, af));
        if (q) {
            list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.admission_no && c.admission_no.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
        }
        if (sf === 'completed') {
            list = list.filter(c => ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => (c.assessments || []).some(a => a.form_type === t)));
        } else if (sf === 'partial') {
            list = list.filter(c => {
                const cnt = ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => (c.assessments || []).some(a => a.form_type === t)).length;
                return cnt > 0 && cnt < 4;
            });
        } else if (sf === 'none') {
            list = list.filter(c => !c.assessments || c.assessments.length === 0);
        }

        generateAllAssessmentsSummaryPdf(list);
    });

    document.getElementById('btn-main-export-overview-pdf')?.addEventListener('click', () => {
        const searchInput = document.getElementById('main-summary-search');
        const statusFilter = document.getElementById('main-summary-status-filter');
        const ageFilter = document.getElementById('main-summary-age-filter');
        const q = (searchInput?.value || '').toLowerCase().trim();
        const sf = statusFilter?.value || 'all';
        const af = ageFilter?.value || 'all';

        let list = allSummaryChildrenList.filter(c => matchesAgeFilter(c, af));
        if (q) {
            list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.admission_no && c.admission_no.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
        }
        if (sf === 'completed') {
            list = list.filter(c => ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => (c.assessments || []).some(a => a.form_type === t)));
        } else if (sf === 'partial') {
            list = list.filter(c => {
                const cnt = ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => (c.assessments || []).some(a => a.form_type === t)).length;
                return cnt > 0 && cnt < 4;
            });
        } else if (sf === 'none') {
            list = list.filter(c => !c.assessments || c.assessments.length === 0);
        }

        generateOverviewGridPdf(list);
    });

    document.getElementById('btn-main-export-all-summary-csv')?.addEventListener('click', () => {
        const searchInput = document.getElementById('main-summary-search');
        const statusFilter = document.getElementById('main-summary-status-filter');
        const ageFilter = document.getElementById('main-summary-age-filter');
        const q = (searchInput?.value || '').toLowerCase().trim();
        const sf = statusFilter?.value || 'all';
        const af = ageFilter?.value || 'all';

        let list = allSummaryChildrenList.filter(c => matchesAgeFilter(c, af));
        if (q) {
            list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.admission_no && c.admission_no.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
        }
        if (sf === 'completed') {
            list = list.filter(c => ['Consultation Form', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => (c.assessments || []).some(a => a.form_type === t)));
        }

        exportAllAssessmentsSummaryCsv(list);
    });

    document.getElementById('btn-print-assessment-summaries')?.addEventListener('click', () => {
        window.print();
    });

    // View Switcher (Germany Summary Sheet vs Cards vs Matrix)
    const btnViewSheet = document.getElementById('btn-view-sheet');
    const btnViewCards = document.getElementById('btn-view-cards');
    const btnViewMatrix = document.getElementById('btn-view-matrix');
    const sheetsContainerEl = document.getElementById('summary-sheets-container');
    const cardsContainerEl = document.getElementById('summary-cards-container');
    const matrixContainerEl = document.getElementById('summary-matrix-container');
    const btnToggleAllCards = document.getElementById('btn-toggle-all-cards');

    function updateMainSummaryViewUI() {
        if (btnViewSheet) {
            btnViewSheet.classList.toggle('active', currentMainSummaryView === 'sheet');
            btnViewSheet.style.background = currentMainSummaryView === 'sheet' ? '#fff' : 'transparent';
            btnViewSheet.style.color = currentMainSummaryView === 'sheet' ? 'var(--primary)' : 'var(--text-light)';
        }
        if (btnViewCards) {
            btnViewCards.classList.toggle('active', currentMainSummaryView === 'cards');
            btnViewCards.style.background = currentMainSummaryView === 'cards' ? '#fff' : 'transparent';
            btnViewCards.style.color = currentMainSummaryView === 'cards' ? 'var(--primary)' : 'var(--text-light)';
        }
        if (btnViewMatrix) {
            btnViewMatrix.classList.toggle('active', currentMainSummaryView === 'matrix');
            btnViewMatrix.style.background = currentMainSummaryView === 'matrix' ? '#fff' : 'transparent';
            btnViewMatrix.style.color = currentMainSummaryView === 'matrix' ? 'var(--primary)' : 'var(--text-light)';
        }
        if (sheetsContainerEl) sheetsContainerEl.style.display = currentMainSummaryView === 'sheet' ? 'flex' : 'none';
        if (cardsContainerEl) cardsContainerEl.style.display = currentMainSummaryView === 'cards' ? 'flex' : 'none';
        if (matrixContainerEl) matrixContainerEl.style.display = currentMainSummaryView === 'matrix' ? 'block' : 'none';
        if (btnToggleAllCards) {
            btnToggleAllCards.style.display = (currentMainSummaryView === 'cards' || currentMainSummaryView === 'sheet') ? 'inline-flex' : 'none';
            const iconEl = document.getElementById('toggle-cards-icon');
            const textEl = document.getElementById('toggle-cards-text');
            if (iconEl) iconEl.textContent = allCardsExpanded ? '⊟' : '⊞';
            if (textEl) textEl.textContent = allCardsExpanded ? 'Collapse All' : 'Expand All';
        }
    }

    btnViewSheet?.addEventListener('click', () => {
        currentMainSummaryView = 'sheet';
        updateMainSummaryViewUI();
    });

    btnViewCards?.addEventListener('click', () => {
        currentMainSummaryView = 'cards';
        updateMainSummaryViewUI();
    });

    btnViewMatrix?.addEventListener('click', () => {
        currentMainSummaryView = 'matrix';
        updateMainSummaryViewUI();
    });

    // Toggle All Cards / Summaries (Expand All / Collapse All)
    btnToggleAllCards?.addEventListener('click', () => {
        allCardsExpanded = !allCardsExpanded;
        const iconEl = document.getElementById('toggle-cards-icon');
        const textEl = document.getElementById('toggle-cards-text');
        if (iconEl) iconEl.textContent = allCardsExpanded ? '⊟' : '⊞';
        if (textEl) textEl.textContent = allCardsExpanded ? 'Collapse All' : 'Expand All';

        // Toggle cards view bodies
        document.querySelectorAll('.summary-child-card .summary-card-body').forEach(body => {
            body.style.display = allCardsExpanded ? 'flex' : 'none';
        });
        document.querySelectorAll('.summary-child-card .folder-toggle').forEach(t => {
            t.textContent = allCardsExpanded ? '▾' : '▸';
        });

        // Toggle sheet view bodies
        document.querySelectorAll('.sheet-collapsible-body').forEach(body => {
            body.style.display = allCardsExpanded ? 'block' : 'none';
        });
        document.querySelectorAll('.sheet-toggle-icon').forEach(icon => {
            icon.textContent = allCardsExpanded ? '▾' : '▸';
        });
        document.querySelectorAll('.sheet-toggle-label').forEach(label => {
            label.textContent = allCardsExpanded ? 'Collapse Sheet' : 'View Sheet';
        });
        document.querySelectorAll('.sheet-toggle-arrow').forEach(arr => {
            arr.textContent = allCardsExpanded ? '▴' : '▾';
        });
    });

    // Export PDF from Single Child Summary Modal
    document.getElementById('btn-download-child-summary-pdf')?.addEventListener('click', () => {
        if (!currentSummaryChild) {
            showToast('No child summary profile loaded', true);
            return;
        }
        generateChildSummaryPdf(currentSummaryChild, currentSummaryAssessments);
    });

    // Center-Wide Modal export buttons
    document.getElementById('btn-export-all-summary-pdf')?.addEventListener('click', () => {
        generateAllAssessmentsSummaryPdf(allSummaryChildrenList);
    });
    document.getElementById('btn-export-all-summary-csv')?.addEventListener('click', () => {
        exportAllAssessmentsSummaryCsv(allSummaryChildrenList);
    });

    // ── Edit Child Profile Modal ──────────────────────────────
    const childEditModal = document.getElementById('child-edit-modal');
    const childEditForm = document.getElementById('child-edit-form');
    const closeChildEditModal = document.getElementById('close-child-edit-modal');
    const btnCancelChildEdit = document.getElementById('btn-cancel-child-edit');
    const btnEditActiveChild = document.getElementById('btn-edit-active-child');

    function openChildEditModal(child) {
        if (!child || !childEditModal) return;
        document.getElementById('edit-child-id').value = child.id;
        document.getElementById('edit-child-adm').value = child.admission_no || '';
        document.getElementById('edit-child-name').value = child.name || '';
        document.getElementById('edit-child-dob').value = child.dob || '';
        document.getElementById('edit-child-age').value = child.age_at_creation || child.age || extractChildAgeString(child) || '';
        document.getElementById('edit-child-sex').value = child.sex || '';
        document.getElementById('edit-child-mobile').value = child.mobile || '';
        const autismEl = document.getElementById('edit-child-is-autism');
        if (autismEl) autismEl.checked = isAutismChild(child);
        childEditModal.classList.add('show');
    }

    document.getElementById('edit-child-dob')?.addEventListener('change', async function() {
        const val = this.value;
        if (!val) return;
        const years = calcAgeYearsFromDob(val); // live incremented age
        if (years === null) return;
        const admInp = document.getElementById('edit-child-adm');
        if (!admInp) return;
        const curAdm = admInp.value.trim().toUpperCase();
        if (years >= 8 && (!curAdm || curAdm.startsWith('EIC'))) {
            const nextNo = await fetchNextAdmissionNo('TH');
            if (nextNo) admInp.value = nextNo;
        } else if (years < 8 && (!curAdm || curAdm.startsWith('TH'))) {
            const nextNo = await fetchNextAdmissionNo('EIC');
            if (nextNo) admInp.value = nextNo;
        }
    });

    function closeChildEditModalDialog() {
        if (childEditModal) childEditModal.classList.remove('show');
    }

    closeChildEditModal?.addEventListener('click', closeChildEditModalDialog);
    btnCancelChildEdit?.addEventListener('click', closeChildEditModalDialog);
    window.addEventListener('click', (e) => {
        if (e.target === childEditModal) closeChildEditModalDialog();
    });

    btnEditActiveChild?.addEventListener('click', () => {
        if (activeChild) openChildEditModal(activeChild);
        else showToast('No active child selected', true);
    });

    childEditForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-child-id').value;
        const staticAge = document.getElementById('edit-child-age').value.trim() || null;
        const payload = {
            admission_no: document.getElementById('edit-child-adm').value.trim() || null,
            name: document.getElementById('edit-child-name').value.trim(),
            dob: document.getElementById('edit-child-dob').value || null,
            age: staticAge,
            age_at_creation: staticAge,
            sex: document.getElementById('edit-child-sex').value || null,
            mobile: document.getElementById('edit-child-mobile').value.trim() || null,
            is_autism: document.getElementById('edit-child-is-autism')?.checked === true
        };
        try {
            const resp = await fetch(`/api/children/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (resp.ok) {
                const updatedChild = await resp.json();
                showToast('✅ Child profile updated successfully!');
                closeChildEditModalDialog();
                if (activeChild && activeChild.id == id) {
                    setActiveChild({ ...activeChild, ...updatedChild });
                }
                fetchChildFolders(searchInput ? searchInput.value : '');
            } else {
                const err = await resp.json();
                showToast('Error: ' + (err.error || 'Failed to update child'), true);
            }
        } catch (err) {
            showToast('Failed to update child profile', true);
        }
    });

    // ── Change Password Modal ─────────────────────────────────
    const passwordModal = document.getElementById('password-modal');
    const openPasswordBtn = document.getElementById('btn-open-change-password');
    const closePasswordBtn = document.getElementById('close-password-modal');
    const cancelPasswordBtn = document.getElementById('btn-cancel-password');
    const changePasswordForm = document.getElementById('change-password-form');

    openPasswordBtn?.addEventListener('click', () => {
        if (passwordModal) {
            changePasswordForm?.reset();
            passwordModal.classList.add('show');
        }
    });

    closePasswordBtn?.addEventListener('click', () => passwordModal?.classList.remove('show'));
    cancelPasswordBtn?.addEventListener('click', () => passwordModal?.classList.remove('show'));
    window.addEventListener('click', (e) => {
        if (e.target === passwordModal) passwordModal.classList.remove('show');
    });

    changePasswordForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match!', true);
            return;
        }

        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                showToast('Password updated successfully!');
                passwordModal.classList.remove('show');
                changePasswordForm.reset();
            } else {
                showToast(data.error || 'Failed to update password', true);
            }
        } catch (err) {
            showToast('Error updating password', true);
        }
    });

    // ── Staff & User Management (Admin Only) ───────────────────
    async function fetchUsers() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        try {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading users...</td></tr>';
            const res = await fetch('/api/users');
            if (!res.ok) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--danger);">Failed to load users</td></tr>';
                return;
            }
            const users = await res.json();
            if (!users.length) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No user accounts found.</td></tr>';
                return;
            }
            tbody.innerHTML = users.map(u => {
                const roleBadges = {
                    admin: '<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Admin</span>',
                    staff: '<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (&lt;8 EIC)</span>',
                    staff8: '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (≥8 TH)</span>',
                    autism: '<span style="background:#ede9fe;color:#6d28d9;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (ASD - All Ages)</span>',
                    asd: '<span style="background:#ede9fe;color:#6d28d9;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (ASD - All Ages)</span>'
                };
                const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '-';
                const deleteBtn = ['admin', 'staff', 'staff8', 'autism', 'asd'].includes(u.username) 
                    ? '<span style="color:#94a3b8;font-size:0.8rem;">System Default</span>'
                    : `<button class="btn-delete-user btn-danger btn-sm" data-id="${u.id}" data-name="${u.username}" style="padding:3px 8px;font-size:0.8rem;background:var(--danger);color:white;border:none;border-radius:4px;cursor:pointer;">🗑️ Delete</button>`;
                
                return `<tr>
                    <td><strong>${u.full_name || u.username}</strong></td>
                    <td><code>${u.username}</code></td>
                    <td>${roleBadges[u.role] || u.role}</td>
                    <td>${createdStr}</td>
                    <td>${deleteBtn}</td>
                </tr>`;
            }).join('');

            tbody.querySelectorAll('.btn-delete-user').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.getAttribute('data-id');
                    const uname = btn.getAttribute('data-name');
                    if (confirm(`Are you sure you want to delete user account "${uname}"?`)) {
                        try {
                            const delRes = await fetch(`/api/users/${id}`, { method: 'DELETE' });
                            if (delRes.ok) {
                                showToast(`User "${uname}" removed.`);
                                fetchUsers();
                            } else {
                                const d = await delRes.json();
                                showToast(d.error || 'Failed to delete user', true);
                            }
                        } catch (e) {
                            showToast('Error deleting user', true);
                        }
                    }
                });
            });
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--danger);">Error loading users</td></tr>';
        }
    }

    const addUserForm = document.getElementById('add-user-form');
    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('new-user-fullname').value.trim();
            const username = document.getElementById('new-user-username').value.trim();
            const password = document.getElementById('new-user-password').value;
            const role = document.getElementById('new-user-role').value;

            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, username, password, role })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast(`User account "${username}" created successfully!`);
                    addUserForm.reset();
                    fetchUsers();
                } else {
                    showToast(data.error || 'Failed to create user', true);
                }
            } catch (err) {
                showToast('Network error creating user', true);
            }
        });
    }

    // ── Initial load ─────────────────────────────────────────
    fetchChildFolders(); // populate records on page load
    fetchTherapists(); // load therapists on load to populate dropdowns
    fetchTherapyFees(); // load therapy fees for session recording
    if (userRole === 'admin') fetchUsers();
});
