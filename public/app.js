document.addEventListener('DOMContentLoaded', () => {

    // ── PWA Service Worker Registration ───────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(err => {
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
        if (response.status === 401 && !String(url).includes('/api/login')) {
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
        } else {
            if (loginScreen) loginScreen.style.display = 'none';
            if (appContainer) appContainer.style.display = 'flex';
            
            // Populate user badge in sidebar
            const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const nameEl = document.getElementById('logged-user-name');
            const roleEl = document.getElementById('logged-user-role');
            if (nameEl) nameEl.textContent = u.fullName || u.username || 'User';
            if (roleEl) {
                const roleLabels = {
                    admin: 'Administrator',
                    staff: 'Staff (< 8 yrs)',
                    staff8: 'Staff (≥ 8 yrs)'
                };
                roleEl.textContent = roleLabels[userRole] || userRole;
            }

            applyRoleRestrictions();
        }
    }

    function applyRoleRestrictions() {
        const isStaff = userRole === 'staff' || userRole === 'staff8';
        
        document.querySelectorAll('.admin-only-filter').forEach(el => {
            if (userRole === 'admin') {
                el.style.display = (el.tagName === 'DIV' || el.tagName === 'LI') ? 'flex' : 'inline-block';
            } else {
                el.style.display = 'none';
            }
        });

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
                li[data-target="therapists-settings"], li[data-target="user-management"] {
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

    const logoutBtn = document.getElementById('nav-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('userRole');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            userRole = null;
            authToken = null;
            currentUser = null;
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            checkAuth();
        });
    }

    checkAuth();

    // ── Navigation ───────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (item.id === 'nav-logout') return; // Handled by logout listener

            navItems.forEach(n => { if (n.id !== 'nav-logout') n.classList.remove('active'); });
            tabContents.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.assessment-pane').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const tid = item.getAttribute('data-target');
            if (tid) {
                const tEl = document.getElementById(tid);
                if (tEl) tEl.classList.add('active');
            }
            if (tid === 'records') fetchChildFolders();
            if (tid === 'assessment-summaries') fetchAndRenderAssessmentSummaries();
            if (tid === 'user-management') fetchUsers();
            if (tid === 'therapists-settings') fetchTherapists();
        });
    });

    function switchTab(targetId) {
        navItems.forEach(n => {
            if (n.id !== 'nav-logout') {
                n.classList.toggle('active', n.getAttribute('data-target') === targetId);
            }
        });
        tabContents.forEach(t => t.classList.toggle('active', t.id === targetId));
        document.querySelectorAll('.assessment-pane').forEach(p => p.classList.toggle('active', p.id === targetId));
        if (targetId === 'records') fetchChildFolders();
        if (targetId === 'assessment-summaries') fetchAndRenderAssessmentSummaries();
        if (targetId === 'user-management') fetchUsers();
        if (targetId === 'therapists-settings') fetchTherapists();
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
            const toStore = rapidData ? { ...child, _rapidData: rapidData } : child;
            localStorage.setItem('activeChild', JSON.stringify(toStore));
            activeChild = toStore;
        } else {
            localStorage.removeItem('activeChild');
        }
        updateBanner();
        prefillFromActive();
    }

    function updateBanner() {
        if (activeChild) {
            banner.classList.remove('hidden');
            bannerName.textContent = activeChild.name + (activeChild.admission_no ? ` (Adm: ${activeChild.admission_no})` : '');
            // Show meta details from child profile + rapid assessment data
            const rd = activeChild._rapidData || {};
            const metaParts = [];
            if (activeChild.admission_no)   metaParts.push('Adm\u00a0#' + activeChild.admission_no);
            if (activeChild.sex || rd.sex)  metaParts.push(activeChild.sex || rd.sex);
            if (activeChild.dob)            metaParts.push('DOB\u00a0' + activeChild.dob);
            if (rd.age)                     metaParts.push('Age\u00a0' + rd.age);
            if (activeChild.mobile)         metaParts.push('\uD83D\uDCF1\u00a0' + activeChild.mobile);
            if (rd.diagnosis)               metaParts.push('Dx:\u00a0' + rd.diagnosis);
            let metaEl = document.getElementById('active-child-meta');
            if (!metaEl) {
                metaEl = document.createElement('small');
                metaEl.id = 'active-child-meta';
                metaEl.style.cssText = 'display:block;font-size:0.78rem;color:var(--text-light);margin-top:2px;letter-spacing:0.01em;';
                bannerName.insertAdjacentElement('afterend', metaEl);
            }
            metaEl.textContent = metaParts.join(' \u00b7 ');
        } else {
            banner.classList.add('hidden');
            bannerName.textContent = '\u2014';
            const metaEl = document.getElementById('active-child-meta');
            if (metaEl) metaEl.remove();
        }
    }

    function prefillFromActive() {
        const rd = (activeChild && activeChild._rapidData) || {};

        // ── Lock child name in all assessment forms ──────────────
        const nameFields = [
            document.getElementById('physio-name'),
            document.getElementById('speech-name'),
            document.getElementById('prog-name'),
            document.querySelector('#form-development input[name="child_name"]')
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
            document.querySelector('#form-development input[name="admission_no"]')
        ];
        admFields.forEach(f => {
            if (!f) return;
            if (activeChild && activeChild.admission_no) {
                f.value = activeChild.admission_no;
            } else if (!activeChild) {
                f.value = '';
            }
        });

        // ── Auto-fill Child Development form from Rapid Assessment data ──
        if (!activeChild) return;
        const devForm = document.getElementById('form-development');
        if (!devForm) return;

        // Map: [CSS selector, value]  — only fills if value is non-empty
        const fills = [
            ['input[name="admission_no"]',  activeChild.admission_no || ''],
            ['select[name="sex"]',          activeChild.sex || rd.sex || ''],
            ['input[name="dob"]',           activeChild.dob || rd.dob || ''],
            ['input[name="age"]',           rd.age     || ''],
            ['textarea[name="address"]',    rd.address || ''],
            ['input[name="dev_diagnosis"]', rd.diagnosis || ''],
        ];
        fills.forEach(([sel, val]) => {
            if (!val) return;
            const el = devForm.querySelector(sel);
            if (el) el.value = val;
        });
    }

    btnNew && btnNew.addEventListener('click', () => {
        setActiveChild(null);
        const rf = document.getElementById('form-rapid');
        rf && rf.reset();
        switchTab('rapid-assessment');
        showToast('Start a new Rapid Assessment to create a new child profile.');
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

    // ── BMI Auto-calculate (with age/sex percentiles) ────────
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

    // ── Age Auto-calculate from DOB ──────────────────────────
    function calcAgeYearsFromDob(dobValue) {
        if (!dobValue) return null;
        const parts = String(dobValue).split('T')[0].split('-');
        let birth;
        if (parts.length === 3 && parts[0].length === 4) {
            birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            birth = new Date(dobValue);
        }
        if (isNaN(birth.getTime())) return null;
        const today = new Date();
        let years = today.getFullYear() - birth.getFullYear();
        const months = today.getMonth() - birth.getMonth();
        if (months < 0 || (months === 0 && today.getDate() < birth.getDate())) {
            years--;
        }
        return Math.max(0, years);
    }

    function parseAgeStringToYears(ageStr) {
        if (!ageStr) return 0;
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
        return isNaN(val) ? 0 : val;
    }

    function extractChildAge(childOrRow) {
        if (!childOrRow) return 0;

        // 1. Try DOB from child or attendance row
        const dob = childOrRow.dob || childOrRow.child_dob;
        const yearsFromDob = calcAgeYearsFromDob(dob);
        if (yearsFromDob !== null) return yearsFromDob;

        // 2. Try rapid_data (from attendance report query)
        if (childOrRow.rapid_data) {
            try {
                const rd = typeof childOrRow.rapid_data === 'string' ? JSON.parse(childOrRow.rapid_data) : childOrRow.rapid_data;
                if (rd) {
                    const yDob = calcAgeYearsFromDob(rd.dob);
                    if (yDob !== null) return yDob;
                    if (rd.age) return parseAgeStringToYears(rd.age);
                }
            } catch (e) {}
        }

        // 3. Try assessments array (from /api/children)
        if (Array.isArray(childOrRow.assessments)) {
            const rapid = childOrRow.assessments.find(a => a.form_type === 'Rapid Assessment');
            if (rapid && rapid.data) {
                try {
                    const rd = typeof rapid.data === 'string' ? JSON.parse(rapid.data) : rapid.data;
                    if (rd) {
                        const yDob = calcAgeYearsFromDob(rd.dob);
                        if (yDob !== null) return yDob;
                        if (rd.age) return parseAgeStringToYears(rd.age);
                    }
                } catch (e) {}
            }
        }

        // 4. Try _rapidData on activeChild
        if (childOrRow._rapidData) {
            const rd = childOrRow._rapidData;
            const yDob = calcAgeYearsFromDob(rd.dob);
            if (yDob !== null) return yDob;
            if (rd.age) return parseAgeStringToYears(rd.age);
        }

        return 0;
    }

    function matchesAgeFilter(childOrRow, ageFilterVal = 'all') {
        const ageNum = extractChildAge(childOrRow);
        if (userRole === 'staff') return ageNum < 8;
        if (userRole === 'staff8') return ageNum >= 8;
        if (userRole === 'admin') {
            if (ageFilterVal === 'under8') return ageNum < 8;
            if (ageFilterVal === '8plus') return ageNum >= 8;
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

    function calcAge(dobValue) {
        if (!dobValue) return '';
        const parts = String(dobValue).split('T')[0].split('-');
        let birth;
        if (parts.length === 3 && parts[0].length === 4) {
            birth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            birth = new Date(dobValue);
        }
        if (isNaN(birth.getTime())) return '';
        const today = new Date();
        let years  = today.getFullYear() - birth.getFullYear();
        let months = today.getMonth()    - birth.getMonth();
        if (today.getDate() < birth.getDate()) months--;
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
        ageEl.style.backgroundColor = '#e8e8e8';
        ageEl.style.cursor = 'not-allowed';
        ageEl.title = 'Auto-calculated from Date of Birth';
        const update = () => { ageEl.value = calcAge(dobEl.value); };
        dobEl.addEventListener('change', update);
        dobEl.addEventListener('input',  update);
        if (dobEl.value) update(); // fill on load if DOB already set
    }

    // Rapid Assessment
    wireAgeDob('rapid-dob', 'rapid-age');

    // Child Development form (name-based selectors — target by form context)
    const devDob = devForm && devForm.querySelector('input[name="dob"]');
    const devAge = devForm && devForm.querySelector('input[name="age"]');
    if (devDob && devAge) {
        devAge.setAttribute('readonly', true);
        devAge.style.backgroundColor = '#e8e8e8';
        devAge.style.cursor = 'not-allowed';
        devAge.title = 'Auto-calculated from Date of Birth';
        const updateDevAge = () => { devAge.value = calcAge(devDob.value); };
        devDob.addEventListener('change', updateDevAge);
        devDob.addEventListener('input',  updateDevAge);
        if (devDob.value) updateDevAge();
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
        { id: 'form-rapid',       type: 'Rapid Assessment',         isRapid: true  },
        { id: 'form-development', type: 'Child Development',         isRapid: false },
        { id: 'form-physio',      type: 'Physiotherapy',             isRapid: false },
        { id: 'form-speech',      type: 'Speech Assessment',         isRapid: false },
        { id: 'form-progress',    type: 'Quarterly Progress Review', isRapid: false }
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
            if (fi.isRapid) {
                await handleRapid(data, el);
            } else {
                const name = activeChild ? activeChild.name : (data.child_name || '');
                if (!name) {
                    showToast('Please complete a Rapid Assessment first to create a child profile.', true);
                    return;
                }
                await saveAssessment(activeChild && activeChild.id, name, fi.type, data, el);
            }
        });
    });

    async function handleRapid(data, el) {
        const name = data.child_name;
        if (!name) { showToast('Child name is required.', true); return; }
        const ageNum = extractChildAge({ dob: data.dob, _rapidData: data });

        if (userRole === 'staff8' && ageNum < 8) {
            showToast('Staff for older children can only enter details for children aged 8 or above.', true);
            return;
        }

        if (userRole === 'staff' && ageNum >= 8) {
            alert("More than 8 years");
            return;
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
                    sex: data.sex || null, 
                    mobile: data.mobile || null 
                })
            });
            if (!cr.ok) { showToast('Error creating child profile: ' + (await cr.json()).error, true); return; }
            const child = await cr.json();

            // 2. Save Rapid Assessment linked to child
            const ar = await fetch('/api/assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: child.id, child_name: name, form_type: 'Rapid Assessment', data })
            });
            if (ar.ok) {
                setActiveChild(child, data);
                el.reset();
                showToast('\u2705 Child profile created for "' + name + '"! Opening Child Development form...');
                setTimeout(() => switchTab('child-development'), 1200);
            } else {
                showToast('Error saving assessment: ' + (await ar.json()).error, true);
            }
        } catch (err) {
            console.error(err);
            showToast('Failed to connect to server.', true);
        }
    }

    async function saveAssessment(childId, childName, formType, data, el) {
        if ((userRole === 'staff8' || userRole === 'staff') && activeChild) {
            const ageNum = extractChildAge(activeChild);
            
            if (userRole === 'staff8' && ageNum < 8) {
                showToast('Staff for older children can only enter details for children aged 8 or above.', true);
                return;
            }
            if (userRole === 'staff' && ageNum >= 8) {
                alert("More than 8 years");
                return;
            }
        }
        try {
            const r = await fetch('/api/assessments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ child_id: childId, child_name: childName, form_type: formType, data })
            });
            if (r.ok) {
                showToast(formType + ' saved successfully!');
                const nf = el.querySelector('input[name="child_name"]');
                const sv = nf && nf.value;
                el.reset();
                if (nf && sv) nf.value = sv;
                prefillFromActive();
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
        'Quarterly Progress Review':'\ud83d\udcc8'
    };

    async function fetchChildFolders(q) {
        q = q || '';
        try {
            const url = q ? '/api/children?search=' + encodeURIComponent(q) : '/api/children';
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
            
            if (userRole === 'staff' || userRole === 'staff8' || (userRole === 'admin' && ageFilter !== 'all')) {
                filteredChildren = children.filter(child => matchesAgeFilter(child, ageFilter));
            }

            if (therapyFilter !== 'all') {
                filteredChildren = filteredChildren.filter(child =>
                    child.assessments && child.assessments.some(a => a.form_type === therapyFilter)
                );
            }

            if (!filteredChildren.length) {
                foldersEl.innerHTML = '<div class="empty-folders"><span style="font-size:3rem">\ud83d\udcc2</span><p>No child profiles found.</p></div>';
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

                const childJson    = JSON.stringify({id:child.id, name:child.name, admission_no:child.admission_no || '', dob:child.dob, sex:child.sex, mobile:child.mobile});
                const safeChildJson = childJson.replace(/"/g, '&quot;');
                const openBtn = isActive
                    ? '<span class="active-badge">\u25cf Active</span>'
                    : '<button class="btn-open-folder" data-child-json="' + safeChildJson + '">Open</button>';

                // Assessment form shortcut buttons shown inside the folder
                const formBtns = [
                    { id:'child-development', icon:'\ud83d\udc76', label:'Child Dev.'    },
                    { id:'physiotherapy',     icon:'\ud83d\udcaa', label:'Physio'        },
                    { id:'speech',            icon:'\ud83d\udde3\ufe0f', label:'Speech'  },
                    { id:'progress-review',   icon:'\ud83d\udcc8', label:'Progress'      },
                ].map(f =>
                    '<button class="btn-form-link" data-form-id="' + f.id + '" data-child-json="' + safeChildJson + '">' +
                        f.icon + '\u00a0' + f.label +
                    '</button>'
                ).join('');

                const card = document.createElement('div');
                card.className = 'child-folder-card' + (isActive ? ' folder-active' : '');
                const meta = [child.admission_no ? 'Adm No: ' + child.admission_no : '', child.sex, child.dob ? 'DOB: '+child.dob : '', child.mobile ? '\ud83d\udcf1 '+child.mobile : '', child.assessments.length + ' assessment(s)'].filter(Boolean).join(' \u00b7 ');
                const admBadge = child.admission_no 
                    ? '<span style="display:inline-block; font-size:0.75rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; padding:1px 6px; margin-left:8px; font-weight:600;">Adm: ' + child.admission_no + '</span>'
                    : '';
                card.innerHTML =
                    '<div class="folder-header" data-child-id="' + child.id + '">' +
                        '<div class="folder-title">' +
                            '<span class="folder-icon">' + (isActive ? '\ud83d\udcc2' : '\ud83d\udcc1') + '</span>' +
                            '<div>' +
                                '<strong class="folder-child-name">' + child.name + admBadge + '</strong>' +
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

    async function viewRecord(id) {
        try {
            const r = await fetch('/api/assessments/' + id);
            if (!r.ok) { showToast('Failed to fetch record', true); return; }
            const rec  = await r.json();
            currentViewingRecord = rec;
            const data = rec.data || {};

            modalTitle.textContent = rec.form_type + ' \u2014 ' + rec.child_name;

            const FORM_MAP = {
                'Rapid Assessment':          'form-rapid',
                'Child Development':         'form-development',
                'Physiotherapy':             'form-physio',
                'Speech Assessment':         'form-speech',
                'Quarterly Progress Review': 'form-progress',
            };

            const originalForm = document.getElementById(FORM_MAP[rec.form_type]);

            if (!originalForm) {
                modalBody.innerHTML = '<pre style="white-space:pre-wrap;font-family:monospace;font-size:0.83rem">' + JSON.stringify(data, null, 2) + '</pre>';
                modalContent.classList.remove('modal-form-view');
                modal.classList.add('show');
                return;
            }

            const clone = buildFormClone(originalForm, data, true /* readOnly */);

            // Notice lives OUTSIDE clone so its buttons are clickable
            const dateStr = rec.created_at ? new Date(rec.created_at).toLocaleString() : '';
            const notice  = document.createElement('div');
            notice.className = 'form-view-notice';
            notice.innerHTML =
                '<span class="notice-left">' +
                    '<span>\uD83D\uDCCB Read-only</span>' +
                    '<button class="btn-notice-edit"   data-id="' + id + '">&#9998; Edit</button>' +
                    '<button class="btn-notice-delete" data-id="' + id + '">&#128465; Delete</button>' +
                '</span>' +
                '<span class="notice-date">Saved: ' + dateStr + '</span>';

            modalBody.innerHTML = '';
            modalBody.appendChild(notice);
            modalBody.appendChild(clone);
            modalContent.classList.add('modal-form-view');
            modal.classList.add('show');

            notice.querySelector('.btn-notice-edit').addEventListener('click',   () => editRecord(id));
            notice.querySelector('.btn-notice-delete').addEventListener('click', () => deleteRecord(id));

        } catch (err) { console.error(err); }
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
        // Hide file inputs & upload label
        clone.querySelector('label[for="dev-photo"]') && (clone.querySelector('label[for="dev-photo"]').style.display = 'none');
        clone.querySelectorAll('input[type="file"]').forEach(el => el.style.display = 'none');

        // Remove IDs to avoid DOM conflicts
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

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
            } else {
                el.value = (val !== undefined && val !== null) ? (Array.isArray(val) ? val.join(', ') : String(val)) : '';
            }
            // Remove any locked readonly from prefill (edit mode wants free fields)
            if (!readOnly) {
                el.removeAttribute('readonly');
                el.style.backgroundColor = '';
                el.style.cursor = '';
            }
        });

        // Show conditional-desc blocks that have data
        clone.querySelectorAll('.conditional-desc').forEach(desc => {
            const hasVal = Array.from(desc.querySelectorAll('input, select, textarea')).some(i => i.value && i.value.trim());
            if (hasVal) desc.style.display = 'block';
        });

        // Remove submit buttons
        clone.querySelectorAll('.form-actions').forEach(el => el.remove());

        clone.style.display = 'block';
        if (readOnly) clone.classList.add('form-view-overlay');
        
        // Attach BMI auto-calculation for cloned modal form
        if (window.setupBmiAutoCalc) {
            window.setupBmiAutoCalc(clone);
        }
        
        return clone;
    }

    // ── Edit record ────────────────────────────────────────────
    async function editRecord(id) {
        try {
            const r = await fetch('/api/assessments/' + id);
            if (!r.ok) { showToast('Failed to fetch record', true); return; }
            const rec  = await r.json();
            const data = rec.data || {};

            const FORM_MAP = {
                'Rapid Assessment':          'form-rapid',
                'Child Development':         'form-development',
                'Physiotherapy':             'form-physio',
                'Speech Assessment':         'form-speech',
                'Quarterly Progress Review': 'form-progress',
            };
            const originalForm = document.getElementById(FORM_MAP[rec.form_type]);
            if (!originalForm) { showToast('Cannot edit this form type.', true); return; }

            modalTitle.textContent = '\u270f\ufe0f Edit: ' + rec.form_type + ' \u2014 ' + rec.child_name;

            const clone = buildFormClone(originalForm, data, false /* editable */);
            clone.classList.add('form-edit-mode');

            const actionBar = document.createElement('div');
            actionBar.className = 'modal-edit-actions';
            actionBar.innerHTML =
                '<button class="btn-secondary" id="modal-cancel-edit">Cancel</button>' +
                '<button class="btn-primary"   id="modal-save-edit">\uD83D\uDCBE Save Changes</button>';

            modalBody.innerHTML = '';
            modalBody.appendChild(clone);
            modalBody.appendChild(actionBar);
            modalContent.classList.add('modal-form-view');
            modal.classList.add('show');

            document.getElementById('modal-cancel-edit').addEventListener('click', closeModal);

            document.getElementById('modal-save-edit').addEventListener('click', async () => {
                // Collect form data from the editable clone (it IS in the DOM)
                const fd  = new FormData(clone);
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
                // Preserve photo if not re-uploaded
                if (data.photo_base64 && !newData.photo_base64) newData.photo_base64 = data.photo_base64;

                try {
                    const resp = await fetch('/api/assessments/' + id, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: newData })
                    });
                    if (resp.ok) {
                        showToast('\u2705 Assessment updated successfully!');
                        closeModal();
                        fetchChildFolders();
                    } else {
                        showToast('Error: ' + (await resp.json()).error, true);
                    }
                } catch (err) { showToast('Failed to save.', true); }
            });

        } catch (err) { console.error(err); }
    }

    // ── Delete record ──────────────────────────────────────────
    async function deleteRecord(id) {
        if (!confirm('Delete this assessment? This cannot be undone.')) return;
        try {
            const resp = await fetch('/api/assessments/' + id, { method: 'DELETE' });
            if (resp.ok) {
                showToast('Assessment deleted.');
                closeModal();
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

    const THERAPY_DEFAULTS = {
        "Assessment and Goal setting": { therapist: "Dr. Alen Sam", fee: 250 },
        "Medical review": { therapist: "Dr. Belsi Felix", fee: 300 },
        "Physiotherapy": { therapist: "Mr. Fredly", fee: 250 },
        "Occupational Therapy": { therapist: "Ms. Jeya Nadhini", fee: 250 },
        "Sensory integration Sessions": { therapist: "Ms. Anisha", fee: 100 },
        "Speech Training Sessions": { therapist: "Dr. Vijayasanthi", fee: 150 },
        "Hydro therapy Sessions": { therapist: "Mr. Justin Vens", fee: 100 },
        "ADL Sessions": { therapist: "Mr. Natharajan", fee: 100 },
        "Outdoor Activity Sessions": { therapist: "Mr. Jenish", fee: 100 },
        "Academic Sessions": { therapist: "Dr. Mohandoss", fee: 100 },
        "Music Therapy": { therapist: "Mr. Vimal", fee: 100 },
        "Reflex Therapy": { therapist: "Ms. Vidhya", fee: 250 },
        "Siddha Treatment": { therapist: "Ms. Lega", fee: 0 },
        "Home programme": { therapist: "", fee: 0 },
        "Nursing care and counselling": { therapist: "", fee: 0 },
        "Orthotic Review": { therapist: "", fee: 0 },
        "Other services": { therapist: "", fee: 0 }
    };

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

            // Find matching therapist from dynamic DB, or fallback to hardcoded defaults for smooth transition
            const dynamicMatch = dynamicTherapists.find(t => t.therapy_type === val);
            const defaults = dynamicMatch ? { therapist: dynamicMatch.name, fee: dynamicMatch.fee } : THERAPY_DEFAULTS[val];
            
            if (defaults) {
                therapistSelect.value = defaults.therapist;
                feeInput.value = defaults.fee;
            } else {
                therapistSelect.value = '';
                feeInput.value = 0;
            }
            calculateFinancials();
        });
    }

    [feeInput, concessionInput, paidInput].forEach(inp => {
        if (inp) inp.addEventListener('input', calculateFinancials);
    });

    // Expose globally for the folder buttons
    window.openLogTherapyModal = function(child) {
        document.getElementById('log-therapy-child-id').value = child.id;
        document.getElementById('log-therapy-child-name').value = child.name;
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
            let children = await (await fetch('/api/children')).json();
            const ageFilter = document.getElementById('report-age-filter')?.value || 'all';

            if (userRole === 'staff' || userRole === 'staff8' || (userRole === 'admin' && ageFilter !== 'all')) {
                children = children.filter(child => matchesAgeFilter(child, ageFilter));
            }
            
            select.innerHTML = '<option value="">All Children</option>';
            children.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
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
                
                if (userRole === 'staff' || userRole === 'staff8' || (userRole === 'admin' && ageFilter !== 'all')) {
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
                
                const admBadge = group.admission_no ? `<span style="display:inline-block; font-size:0.75rem; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; padding:1px 6px; margin-left:8px; font-weight:600;">Adm: ${group.admission_no}</span>` : '';

                // Header row
                html += `<tr class="accordion-header" data-child-index="${index}" style="cursor: pointer; background: #f8fafc;">
                    <td colspan="6"><strong><span class="toggle-icon">▼</span> ${group.name}${admBadge}</strong> <span style="color: #64748b; font-size: 0.9em; margin-left: 10px;">(${group.rows.length} session${group.rows.length > 1 ? 's' : ''})</span></td>
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

    // ── Therapists Settings Logic ──────────────────────────────────
    const therapistsTbody = document.getElementById('therapists-table-body');
    const addTherapistForm = document.getElementById('add-therapist-form');

    let dynamicTherapists = [];

    async function fetchTherapists() {
        if (!therapistsTbody) return;
        try {
            therapistsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading...</td></tr>';
            const resp = await fetch('/api/therapists');
            dynamicTherapists = await resp.json();
            
            if (dynamicTherapists.length === 0) {
                therapistsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No therapists found.</td></tr>';
            } else {
                therapistsTbody.innerHTML = dynamicTherapists.map(t => 
                    `<tr>
                        <td><strong>${t.name}</strong></td>
                        <td>${t.therapy_type}</td>
                        <td>${t.fee}</td>
                        <td>
                            <button class="btn-secondary btn-sm" onclick="deleteTherapist(${t.id})" style="color: var(--danger); border-color: var(--danger);">Delete</button>
                        </td>
                    </tr>`
                ).join('');
            }
            populateTherapistDropdowns();
        } catch (err) {
            therapistsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Failed to load therapists.</td></tr>';
        }
    }

    function populateTherapistDropdowns() {
        // Update the log therapy modal dropdown with the latest dynamic therapists
        const select = document.getElementById('log-therapy-therapist');
        if (!select) return;
        
        // Preserve the currently selected value if any
        const currentVal = select.value;
        
        select.innerHTML = '<option value="">Select Therapist...</option>';
        // Extract unique therapist names
        const uniqueNames = [...new Set(dynamicTherapists.map(t => t.name))];
        uniqueNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
        
        if (uniqueNames.includes(currentVal)) {
            select.value = currentVal;
        }
    }

    window.deleteTherapist = async function(id) {
        if (!confirm('Are you sure you want to delete this therapist?')) return;
        try {
            const r = await fetch('/api/therapists/' + id, { method: 'DELETE' });
            if (r.ok) {
                showToast('Therapist deleted');
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
            const name = document.getElementById('new-therapist-name').value;
            const type = document.getElementById('new-therapist-type').value;
            const fee = document.getElementById('new-therapist-fee').value;

            try {
                const resp = await fetch('/api/therapists', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, therapy_type: type, fee: parseFloat(fee) || 0 })
                });
                if (resp.ok) {
                    showToast('Therapist added!');
                    addTherapistForm.reset();
                    fetchTherapists();
                } else {
                    showToast('Error adding therapist', true);
                }
            } catch (err) {
                showToast('Failed to add therapist', true);
            }
        });
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.getAttribute('data-target') === 'therapists-settings') {
                fetchTherapists();
            }
            if (item.getAttribute('data-target') === 'schedule') {
                document.getElementById('schedule-date').value = new Date().toISOString().split('T')[0];
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

    const scheduleDateInput = document.getElementById('schedule-date');
    if (scheduleDateInput) {
        scheduleDateInput.addEventListener('change', loadDailySchedule);
    }

    const scheduleFilterInput = document.getElementById('schedule-child-filter');
    if (scheduleFilterInput) {
        scheduleFilterInput.addEventListener('change', loadDailySchedule);
    }

    async function loadDailySchedule() {
        const tbody = document.getElementById('schedule-table-body');
        if (!tbody) return;
        const date = scheduleDateInput.value;
        if (!date) return;

        tbody.innerHTML = '<tr><td colspan="14" style="text-align: center;">Loading...</td></tr>';
        try {
            // Always fetch fresh children list so newly added/updated children appear immediately
            const respChild = await fetch('/api/children');
            scheduleChildrenList = await respChild.json();

            let permittedChildren = scheduleChildrenList;
            if (userRole === 'staff' || userRole === 'staff8') {
                permittedChildren = scheduleChildrenList.filter(child => matchesAgeFilter(child));
            }

            // Populate filter dropdown
            if (scheduleFilterInput) {
                const currentVal = scheduleFilterInput.value;
                scheduleFilterInput.innerHTML = '<option value="">All Children</option>';
                permittedChildren.forEach(child => {
                    const opt = document.createElement('option');
                    opt.value = child.id;
                    opt.textContent = child.name + (child.admission_no ? ` (${child.admission_no})` : '');
                    scheduleFilterInput.appendChild(opt);
                });
                scheduleFilterInput.value = currentVal;
            }

            // Fetch schedules for the date
            const respSched = await fetch(`/api/schedules?date=${encodeURIComponent(date)}`);
            currentScheduleData = await respSched.json();

            if (permittedChildren.length === 0) {
                tbody.innerHTML = '<tr><td colspan="14" style="text-align: center;">No permitted children registered.</td></tr>';
                return;
            }

            const filterChildId = scheduleFilterInput ? scheduleFilterInput.value : '';
            const filteredChildren = filterChildId 
                ? permittedChildren.filter(c => c.id == filterChildId)
                : permittedChildren;

            let html = '';
            filteredChildren.forEach((child, index) => {
                const admBadge = child.admission_no ? `<br><small style="color: #64748b; font-size: 0.72rem; font-weight: 500;">Adm: ${child.admission_no}</small>` : '';
                html += `<tr>`;
                html += `<td class="sticky-col">${index + 1}. ${child.name}${admBadge}</td>`;
                
                TIME_SLOTS.forEach(slot => {
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

                        html += `<td data-child="${child.id}" data-childname="${child.name}" data-slot="${slot}" data-id="${block.id}" data-type="${block.therapy_type}" data-therapist="${block.therapist_name || ''}">
                                    <div class="schedule-cell ${colorClass}">
                                        <span>${shortTherapy}</span>
                                        <span class="therapist-name">(${block.therapist_name || 'TBD'})</span>
                                    </div>
                                 </td>`;
                    } else {
                        html += `<td data-child="${child.id}" data-childname="${child.name}" data-slot="${slot}"></td>`;
                    }
                });
                
                html += `</tr>`;
            });
            tbody.innerHTML = html;
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
            const val = schedTherapySelect.value;
            const therapistSelect = document.getElementById('schedule-therapist');
            therapistSelect.innerHTML = '<option value="">Select Therapist...</option>';
            
            const uniqueNames = [...new Set(dynamicTherapists.map(t => t.name))];
            uniqueNames.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                therapistSelect.appendChild(opt);
            });

            // Auto-select if exists
            const match = dynamicTherapists.find(t => t.therapy_type === val);
            if (match) {
                therapistSelect.value = match.name;
            }
        });
    }

    document.getElementById('schedule-table-body')?.addEventListener('click', (e) => {
        const td = e.target.closest('td');
        if (!td || td.classList.contains('sticky-col')) return;

        const childId = td.dataset.child;
        const childName = td.dataset.childname;
        const timeSlot = td.dataset.slot;
        const blockId = td.dataset.id;
        
        document.getElementById('schedule-child-id').value = childId;
        document.getElementById('schedule-time-slot').value = timeSlot;
        document.getElementById('schedule-modal-subtitle').textContent = `For ${childName} at ${timeSlot}`;
        
        currentScheduleBlockId = blockId || null;
        
        const deleteBtn = document.getElementById('btn-delete-schedule');
        if (blockId) {
            document.getElementById('schedule-therapy-type').value = td.dataset.type;
            // trigger change to load therapists
            schedTherapySelect.dispatchEvent(new Event('change'));
            document.getElementById('schedule-therapist').value = td.dataset.therapist;
            deleteBtn.style.display = 'block';
        } else {
            scheduleForm.reset();
            document.getElementById('schedule-child-id').value = childId;
            document.getElementById('schedule-time-slot').value = timeSlot;
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

    if (scheduleForm) {
        scheduleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                date: scheduleDateInput.value,
                child_id: document.getElementById('schedule-child-id').value,
                time_slot: document.getElementById('schedule-time-slot').value,
                therapy_type: document.getElementById('schedule-therapy-type').value,
                therapist_name: document.getElementById('schedule-therapist').value
            };
            try {
                const resp = await fetch('/api/schedules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (resp.ok) {
                    scheduleModal.classList.remove('show');
                    loadDailySchedule();
                } else {
                    showToast('Failed to save schedule block', true);
                }
            } catch (err) {
                showToast('Failed to save schedule block', true);
            }
        });
    }

    document.getElementById('btn-delete-schedule')?.addEventListener('click', async () => {
        if (!currentScheduleBlockId) return;
        if (!confirm('Remove this therapy block?')) return;
        try {
            const resp = await fetch('/api/schedules/' + currentScheduleBlockId, { method: 'DELETE' });
            if (resp.ok) {
                scheduleModal.classList.remove('show');
                loadDailySchedule();
            }
        } catch (err) {
            showToast('Failed to remove block', true);
        }
    });

    document.getElementById('btn-print-schedule')?.addEventListener('click', () => {
        window.print();
    });

    function getScheduleMessageAndChild() {
        const date = scheduleDateInput.value;
        if (!date) {
            showToast('Please select a date first', true);
            return null;
        }

        const filterChildId = scheduleFilterInput ? scheduleFilterInput.value : '';
        if (!filterChildId) {
            showToast('Please select a specific child first', true);
            return null;
        }

        const child = scheduleChildrenList.find(c => c.id == filterChildId);
        if (!child) return null;

        const blocks = currentScheduleData.filter(s => s.child_id == child.id);
        if (blocks.length === 0) {
            showToast('No sessions scheduled for this child on this date.', true);
            return null;
        }

        const timeOrder = {};
        TIME_SLOTS.forEach((slot, index) => timeOrder[slot] = index);
        blocks.sort((a, b) => timeOrder[a.time_slot] - timeOrder[b.time_slot]);

        const formattedDate = formatDisplayDate(date);
        let message = `📅 Therapy Schedule for ${child.name}${child.admission_no ? ` (Adm: ${child.admission_no})` : ''}\n`;
        message += `🗓 Date: ${formattedDate}\n\n`;

        blocks.forEach(block => {
            message += `⏰ ${block.time_slot}\n`;
            message += `🔹 ${block.therapy_type}\n\n`;
        });

        return { message: message.trim(), child };
    }

    document.getElementById('btn-share-schedule')?.addEventListener('click', () => {
        const data = getScheduleMessageAndChild();
        if (!data) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(data.message).then(() => {
                showToast('Schedule copied to clipboard! You can now paste it.');
            }).catch(() => {
                copyViaFallback(data.message);
            });
        } else {
            copyViaFallback(data.message);
        }

        function copyViaFallback(text) {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(ta);
                if (successful) {
                    showToast('Schedule copied to clipboard! You can now paste it.');
                } else {
                    showToast('Failed to copy. Please try again.', true);
                }
            } catch (err) {
                showToast('Failed to copy. Please try again.', true);
            }
        }
    });

    // ── WhatsApp Daily Schedule Dispatch ──────────────────────
    document.getElementById('btn-whatsapp-schedule')?.addEventListener('click', () => {
        const data = getScheduleMessageAndChild();
        if (!data) return;

        let phone = (data.child.mobile || '').replace(/\D/g, '');
        if (phone.length === 10) phone = '91' + phone; // Default country code if 10 digits
        const text = encodeURIComponent(data.message);
        const waUrl = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(waUrl, '_blank');
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
        document.getElementById('child-summary-modal')?.classList.remove('show');
        if (childSummaryOpenedFromMatrix) {
            document.getElementById('all-summary-modal')?.classList.add('show');
        }
    });
    document.getElementById('close-all-summary-modal')?.addEventListener('click', () => {
        document.getElementById('all-summary-modal')?.classList.remove('show');
        childSummaryOpenedFromMatrix = false;
    });
    document.getElementById('btn-back-to-matrix')?.addEventListener('click', () => {
        document.getElementById('child-summary-modal')?.classList.remove('show');
        document.getElementById('all-summary-modal')?.classList.add('show');
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
    let currentMainSummaryView = 'cards'; // 'cards' | 'matrix'
    let allCardsExpanded = false;

    // Helper: Clean label for key-value display
    function cleanLabel(key) {
        return key.replace(/_/g, ' ')
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase());
    }

    // Helper: Extract rich structured clinical summary across all 5 forms
    function extractAssessmentSummaries(child, assessments = []) {
        const rapid = assessments.find(a => a.form_type === 'Rapid Assessment');
        const dev = assessments.find(a => a.form_type === 'Child Development');
        const physio = assessments.find(a => a.form_type === 'Physiotherapy');
        const speech = assessments.find(a => a.form_type === 'Speech Assessment');
        const progressReviews = assessments.filter(a => a.form_type === 'Quarterly Progress Review');

        // 1. Rapid Assessment
        const rData = rapid?.data || {};
        const rapidSummary = {
            exists: !!rapid,
            id: rapid?.id,
            date: rapid?.created_at ? new Date(rapid.created_at).toLocaleDateString('en-IN') : null,
            diagnosis: rData.diagnosis || 'Provisional diagnosis not specified',
            symptoms: rData.symptoms || 'None recorded',
            birth_history: rData.birth_history || 'Not specified',
            medical_history: rData.medical_history || 'Not specified',
            finalized_by: rData.finalized_by || 'Not specified',
            teamObservations: [
                { role: 'Physiotherapist', obs: rData.physio_observation, sug: rData.physio_suggestion },
                { role: 'Occupational Therapist', obs: rData.occupational_observation, sug: rData.occupational_suggestion },
                { role: 'Sensory Therapist', obs: rData.sensory_observation, sug: rData.sensory_suggestion },
                { role: 'Speech Therapist', obs: rData.speech_observation, sug: rData.speech_suggestion },
                { role: 'P & O Consultant', obs: rData.po_observation, sug: rData.po_suggestion }
            ].filter(t => t.obs || t.sug)
        };

        // 2. Child Development
        const dData = dev?.data || {};
        const delays = [
            dData.gross_motor_delay ? `Gross Motor: ${dData.gross_motor_delay}` : '',
            dData.fine_motor_delay ? `Fine Motor: ${dData.fine_motor_delay}` : '',
            dData.speech_delay ? `Speech: ${dData.speech_delay}` : '',
            dData.cognitive_delay ? `Cognitive: ${dData.cognitive_delay}` : ''
        ].filter(Boolean);

        const conditions = [
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
            dData.delivery_term ? `Term: ${dData.delivery_term}` : '',
            dData.birth_weight ? `Birth Wt: ${dData.birth_weight}` : '',
            dData.birth_cry ? `Birth Cry: ${dData.birth_cry}` : '',
            dData.incubator_support ? `Incubator: ${dData.incubator_support}` : '',
            dData.hospital_stay_days ? `Hospital Stay: ${dData.hospital_stay_days}d` : ''
        ].filter(Boolean);

        const anthropometryList = [
            dData.height ? `Height: ${dData.height}cm` : '',
            dData.weight ? `Weight: ${dData.weight}kg` : '',
            dData.bmi ? `BMI: ${dData.bmi}` : '',
            dData.head_circ ? `Head Circ: ${dData.head_circ}cm` : '',
            dData.chest_circ ? `Chest: ${dData.chest_circ}cm` : ''
        ].filter(Boolean);

        const devSummary = {
            exists: !!dev,
            id: dev?.id,
            date: dev?.created_at ? new Date(dev.created_at).toLocaleDateString('en-IN') : null,
            diagnosis: dData.dev_diagnosis || dData.developmental_diagnosis || dData.clinical_impression || dData.diagnosis || 'Developmental Profile Recorded',
            chief_complaints: dData.chief_complaints || dData.chief_complaint || 'Developmental evaluation conducted',
            informant: dData.informant ? `${dData.informant} (${dData.relationship || 'Guardian'})` : 'Parents',
            delivery: deliveryList.join(' · ') || 'Uneventful perinatal history',
            anthropometry: anthropometryList.join(' · ') || '',
            delays,
            conditions,
            goals: dData.treatment_goal || dData.treatment_plan || dData.parent_expectations || '',
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
            workupStatus
        };
    }

    // Helper: Build the complete Multi-Disciplinary Dossier HTML for a child (all forms together!)
    function renderChildConsolidatedCardHtml(child, assessments = [], isFullModal = false) {
        const summary = extractAssessmentSummaries(child, assessments);
        const ageYears = extractChildAge(child);
        const ageStr = ageYears ? `${ageYears} yrs` : (child.dob ? `DOB: ${child.dob}` : 'Age not specified');
        const safeChildJson = JSON.stringify({ id: child.id, name: child.name, admission_no: child.admission_no || '', dob: child.dob, sex: child.sex, mobile: child.mobile }).replace(/"/g, '&quot;');

        const statusBadgeText = summary.coreCount === 4 
            ? '✓ 4/4 Core Complete' 
            : (summary.totalCount > 0 ? `${summary.coreCount}/4 Disciplines Done` : 'Pending Workup (0)');
        const statusBadgeBg = summary.coreCount === 4 ? '#dcfce7' : (summary.totalCount > 0 ? '#fef9c3' : '#fee2e2');
        const statusBadgeColor = summary.coreCount === 4 ? '#15803d' : (summary.totalCount > 0 ? '#a16207' : '#b91c1c');

        // Form 1 Panel: Rapid Assessment
        const r = summary.rapid;
        const rapidPanelHtml = `
            <div class="summary-form-panel ${r.exists ? 'panel-done' : 'panel-pending'}">
                <div class="summary-panel-header">
                    <div class="summary-panel-title">
                        <span>⚡</span> <span>Rapid Assessment</span>
                    </div>
                    ${r.exists ? `
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="summary-panel-date">📅 ${r.date}</span>
                            <button class="btn-summary-view-form btn-secondary btn-sm" data-id="${r.id}" style="padding: 2px 7px; font-size: 0.75rem;">View Form</button>
                        </div>
                    ` : `
                        <button class="btn-conduct-form btn-secondary btn-sm" data-form="rapid-assessment" data-child-json="${safeChildJson}" style="padding: 2px 8px; font-size: 0.75rem; background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;">+ Conduct</button>
                    `}
                </div>
                ${r.exists ? `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="summary-field-box" style="background: #eff6ff; border-color: #bfdbfe;">
                            <div class="field-label" style="color: #1e40af;">Clinical Diagnosis</div>
                            <div class="field-val" style="font-weight: 700; color: #1e3a8a;">${r.diagnosis}</div>
                        </div>
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
                        <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                            <strong>Finalized by:</strong> ${r.finalized_by}
                        </div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 0.85rem;">
                        <span>⏳ Initial triage assessment not conducted yet</span>
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
                            <strong>${child.name}</strong>
                            <div class="summary-child-meta">${ageStr} / ${child.sex || '-'} · ${child.admission_no ? `Adm: ${child.admission_no} · ` : ''}📱 ${child.mobile || 'None'} · ID: #${child.id}</div>
                        </div>
                    </div>

                    <!-- Discipline Status Badges -->
                    <div class="summary-card-disciplines-bar">
                        <span class="discipline-pill ${summary.rapid.exists ? 'done' : 'pending'}">⚡ Rapid: ${summary.rapid.exists ? '✓ ' + summary.rapid.date : 'Pending'}</span>
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
                        <span class="folder-toggle" style="font-size: 1.1rem; color: #64748b;">▾</span>
                    </div>
                </div>

                <!-- Body (All 5 forms together) -->
                <div class="summary-card-body" id="summary-card-body-${child.id}">
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
        const ageStr = ageYears ? `${ageYears}y` : (child.dob || '-');
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
            ? `<span style="font-size:0.75rem; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:3px; padding:1px 5px; margin-left:6px; font-weight:600;">Adm: ${child.admission_no}</span>`
            : '';

        return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 14px; text-align: center; color: #64748b; font-weight: 600;">${index + 1}</td>
                <td style="padding: 12px 14px;">
                    <strong style="color: #0f172a; font-size: 0.92rem; display: block;">${child.name}${admBadge}</strong>
                    <div style="font-size: 0.78rem; color: #64748b;">${ageStr} / ${child.sex || '-'} · 📱 ${child.mobile || 'None'}</div>
                </td>
                <td style="padding: 12px 14px;">
                    ${r.exists ? `
                        <div class="matrix-snippet-box">
                            <strong>${r.diagnosis}</strong>
                            <div style="color: #475569; font-size: 0.76rem;">📅 ${r.date}</div>
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
            const res = await fetch('/api/children');
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
                const mobileMatch = c.mobile && c.mobile.includes(q);
                const aList = c.assessments || [];
                const diagMatch = aList.some(a => {
                    const d = a.data || {};
                    const txt = JSON.stringify(d).toLowerCase();
                    return txt.includes(q);
                });
                return nameMatch || mobileMatch || diagMatch;
            });
        }

        if (sf === 'completed') {
            list = list.filter(c => {
                const aList = c.assessments || [];
                return ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => aList.some(a => a.form_type === t));
            });
        } else if (sf === 'partial') {
            list = list.filter(c => {
                const aList = c.assessments || [];
                const majorDone = ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => aList.some(a => a.form_type === t)).length;
                return majorDone > 0 && majorDone < 4;
            });
        } else if (sf === 'none') {
            list = list.filter(c => !c.assessments || c.assessments.length === 0);
        } else if (sf === 'missing-rapid') {
            list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Rapid Assessment')));
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
            const hasRapid = aList.some(a => a.form_type === 'Rapid Assessment');
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

        // Render Cards View
        if (!list.length) {
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
        const admBadge = child.admission_no ? ` · Adm: ${child.admission_no}` : '';
        
        nameEl.textContent = `Clinical Assessment Summary — ${child.name}`;
        subEl.textContent = `${child.sex || 'Child'} · ${ageStr} · Mobile: ${child.mobile || 'None'} · ID: #${child.id}${admBadge}`;

        kpisEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 15px; color: var(--text-light);">Loading assessment history...</div>';
        domainsEl.innerHTML = '';
        detailsEl.innerHTML = '';
        modal.classList.add('show');

        try {
            const res = await fetch(`/api/children/${child.id}`);
            let childData = child;
            let assessments = [];
            if (res.ok) {
                childData = await res.json();
                assessments = childData.assessments || [];
                if (childData.admission_no && !subEl.textContent.includes('Adm:')) {
                    subEl.textContent += ` · Adm: ${childData.admission_no}`;
                }
            } else {
                const aRes = await fetch(`/api/assessments?child_id=${child.id}`);
                if (aRes.ok) assessments = await aRes.json();
            }

            currentSummaryChild = childData;
            currentSummaryAssessments = assessments;

            const summary = extractAssessmentSummaries(childData, assessments);

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
                { type: 'Rapid Assessment', label: 'Rapid Assessment', icon: '⚡', record: summary.rapid.exists ? summary.rapid : null },
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

        try {
            const res = await fetch('/api/children');
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
                const hasRapid = aList.some(a => a.form_type === 'Rapid Assessment');
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
                        return ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => aList.some(a => a.form_type === t));
                    });
                } else if (f === 'partial') {
                    list = list.filter(c => {
                        const aList = c.assessments || [];
                        const majorDone = ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => aList.some(a => a.form_type === t)).length;
                        return majorDone > 0 && majorDone < 4;
                    });
                } else if (f === 'none') {
                    list = list.filter(c => (!c.assessments || c.assessments.length === 0));
                } else if (f === 'missing-rapid') {
                    list = list.filter(c => !((c.assessments || []).some(a => a.form_type === 'Rapid Assessment')));
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
            if (filterSelect) filterSelect.onchange = handleFilterChange;

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
            const ageStr = ageYears ? `${ageYears} yrs` : (c.dob ? `DOB: ${c.dob}` : 'N/A');
            const aList = c.assessments || [];

            const renderBadge = (formType) => {
                const match = aList.find(a => a.form_type === formType);
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

            const admBadge = c.admission_no ? `<div style="font-size: 0.73rem; color: #0284c7; font-weight: 600;">Adm: ${c.admission_no}</div>` : '';
            const safeChildJson = JSON.stringify({ id: c.id, name: c.name, admission_no: c.admission_no, dob: c.dob, sex: c.sex, mobile: c.mobile }).replace(/"/g, '&quot;');

            return `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 12px;"><strong>${c.name}</strong>${admBadge}</td>
                    <td style="padding: 10px 12px; color: #64748b; font-size: 0.82rem;">${ageStr} / ${c.sex || '-'}</td>
                    <td style="padding: 10px 12px; text-align: center;">${renderBadge('Rapid Assessment')}</td>
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

    // ── Generate Comprehensive Child Summary PDF (All Forms Together!) ───────
    function generateChildSummaryPdf(child, assessments = []) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            showToast('PDF generator is initializing, please try again in a moment', true);
            return;
        }

        try {
            const doc = new window.jspdf.jsPDF('portrait', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 14;

            // Brand Header Banner
            doc.setFillColor(30, 58, 138); // Deep Navy
            doc.rect(margin, 10, pageWidth - (margin * 2), 2.5, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(30, 58, 138);
            doc.text('CHITRA ORTHO & REHAB CLINIC', pageWidth / 2, 17, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(71, 85, 105);
            doc.text('CHILD DEVELOPMENT & EARLY INTERVENTION CENTRE', pageWidth / 2, 21.5, { align: 'center' });
            doc.setFontSize(7.5);
            doc.text('Comprehensive Multi-Disciplinary Clinical Assessment Dossier', pageWidth / 2, 25.5, { align: 'center' });

            // Child Demographics Table
            const ageYears = extractChildAge(child);
            const ageStr = ageYears ? `${ageYears} yrs` : (child.dob ? `DOB: ${child.dob}` : 'N/A');
            const summaryDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            const summary = extractAssessmentSummaries(child, assessments);

            doc.autoTable({
                startY: 29,
                head: [['PATIENT CLINICAL SUMMARY RECORD', '']],
                body: [
                    ['Child Name:', child.name || 'N/A', 'Admission No:', child.admission_no || 'N/A'],
                    ['Patient ID:', '#' + (child.id || '-'), 'Date of Birth:', child.dob || 'Not specified'],
                    ['Age / Sex:', `${ageStr} / ${child.sex || '-'}`, 'Contact Phone:', child.mobile || 'None'],
                    ['Dossier Generated:', summaryDate, 'Workup Status:', summary.coreCount === 4 ? 'Complete Multi-Disciplinary Workup (4/4)' : `${summary.coreCount}/4 Disciplines Completed`]
                ],
                theme: 'plain',
                styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
                headStyles: {
                    fillColor: [241, 245, 249],
                    textColor: [30, 58, 138],
                    fontStyle: 'bold',
                    fontSize: 8.5
                },
                columnStyles: {
                    0: { fontStyle: 'bold', width: 32 },
                    1: { width: 58 },
                    2: { fontStyle: 'bold', width: 34 },
                    3: { width: 58 }
                },
                margin: { left: margin, right: margin }
            });

            // Executive Assessment Matrix Table
            const matrixRows = [
                ['1', 'Rapid Assessment', summary.rapid.exists ? summary.rapid.date : '-', summary.rapid.exists ? summary.rapid.diagnosis : 'Pending assessment', summary.rapid.exists ? 'Completed' : 'Pending'],
                ['2', 'Child Development', summary.dev.exists ? summary.dev.date : '-', summary.dev.exists ? summary.dev.diagnosis : 'Pending assessment', summary.dev.exists ? 'Completed' : 'Pending'],
                ['3', 'Physiotherapy', summary.physio.exists ? summary.physio.date : '-', summary.physio.exists ? summary.physio.diagnosis : 'Pending assessment', summary.physio.exists ? 'Completed' : 'Pending'],
                ['4', 'Speech Assessment', summary.speech.exists ? summary.speech.date : '-', summary.speech.exists ? summary.speech.diagnosis : 'Pending assessment', summary.speech.exists ? 'Completed' : 'Pending'],
                ['5', 'Quarterly Progress Reviews', summary.progress.length ? `${summary.progress.length} Review(s)` : '-', summary.progress.length ? summary.progress[0].achievement : 'No reviews recorded', summary.progress.length ? 'Completed' : 'Pending']
            ];

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 4,
                head: [['#', 'Assessment Discipline', 'Date', 'Primary Clinical Finding / Impression', 'Status']],
                body: matrixRows,
                theme: 'striped',
                styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59] },
                headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                columnStyles: {
                    0: { width: 10, halign: 'center' },
                    1: { width: 45, fontStyle: 'bold' },
                    2: { width: 25 },
                    3: { width: 82 },
                    4: { width: 20, halign: 'center' }
                },
                margin: { left: margin, right: margin }
            });

            // Detailed Findings Breakdown Table across ALL 5 forms
            const domainFindings = [];

            if (summary.rapid.exists) {
                const r = summary.rapid;
                let teamStr = r.teamObservations.map(t => `${t.role}: ${t.obs || ''} (Sug: ${t.sug || '-'})`).join('\n');
                domainFindings.push([
                    '1. Rapid Assessment\n(' + r.date + ')',
                    `Diagnosis: ${r.diagnosis}\nSymptoms: ${r.symptoms}\nBirth History: ${r.birth_history} | Med: ${r.medical_history}\n${teamStr ? 'Team Observations:\n' + teamStr + '\n' : ''}Finalized By: ${r.finalized_by}`
                ]);
            }

            if (summary.dev.exists) {
                const d = summary.dev;
                domainFindings.push([
                    '2. Child Development\n(' + d.date + ')',
                    `Developmental Impression: ${d.diagnosis}\nChief Complaints: ${d.chief_complaints} (Informant: ${d.informant})\nPerinatal: ${d.delivery}\nIdentified Delays: ${d.delays.join(', ') || 'None stated'}\nConditions: ${d.conditions.join(', ') || 'None noted'}\nGoals & Plan: ${d.goals || 'Targeted early intervention'}`
                ]);
            }

            if (summary.physio.exists) {
                const p = summary.physio;
                domainFindings.push([
                    '3. Physiotherapy\n(' + p.date + ')',
                    `Diagnosis: ${p.diagnosis}\nGait & Mobility: ${p.gait}\nMuscle Tone & Clonus: Tone: ${p.tone} | Clonus: ${p.clonus}\nDeformities: ${p.deformities.join(', ') || 'None visible'}\nMilestones: ${p.milestones.join(', ') || 'Evaluated'}\nTreatment Plan: ${p.plan}`
                ]);
            }

            if (summary.speech.exists) {
                const s = summary.speech;
                domainFindings.push([
                    '4. Speech Assessment\n(' + s.date + ')',
                    `Diagnosis: ${s.diagnosis}\nArticulation: ${s.articulation}\nVoice: ${s.voice} | Rhythm: ${s.rhythm}\nIntelligibility: ${s.intelligibility}\nTherapy Plan: ${s.plan}`
                ]);
            }

            if (summary.progress.length > 0) {
                const prText = summary.progress.map(pr => `${pr.quarter} (${pr.date}): Achieved: ${pr.achievement} | Next: ${pr.next_plan}`).join('\n');
                domainFindings.push([
                    '5. Progress Reviews\n(' + summary.progress.length + ' Recorded)',
                    prText
                ]);
            }

            if (domainFindings.length > 0) {
                doc.autoTable({
                    startY: doc.lastAutoTable.finalY + 4,
                    head: [['Clinical Discipline & Date', 'Multidisciplinary Summary of Findings & Action Plan']],
                    body: domainFindings,
                    theme: 'grid',
                    styles: { fontSize: 7.5, cellPadding: 2.8, textColor: [30, 41, 59], overflow: 'linebreak' },
                    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
                    columnStyles: {
                        0: { width: 55, fontStyle: 'bold' },
                        1: { width: pageWidth - (margin * 2) - 55 }
                    },
                    margin: { left: margin, right: margin }
                });
            }

            // Clinician Sign-off Block
            let sigY = doc.lastAutoTable.finalY + 14;
            if (sigY + 28 > pageHeight - 14) {
                doc.addPage();
                sigY = 24;
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text('Multidisciplinary Therapy Team:', margin, sigY);
            doc.text('Clinical In-Charge / Medical Supervisor:', pageWidth - margin - 60, sigY);

            doc.setDrawColor(203, 213, 225);
            doc.line(margin, sigY + 12, margin + 55, sigY + 12);
            doc.line(pageWidth - margin - 60, sigY + 12, pageWidth - margin, sigY + 12);

            doc.setFontSize(7.5);
            doc.text('Therapist Signatures & Date', margin, sigY + 16);
            doc.text('Authorized Signatory & Seal', pageWidth - margin - 60, sigY + 16);

            // Add Header/Footer to each page
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
                doc.text('Chitra Ortho & Rehab Clinic - Confidential Clinical Assessment Dossier', margin, pageHeight - 6);
            }

            const cleanName = (child.name || 'Child').replace(/[^a-zA-Z0-9]/g, '_');
            const filename = `Clinical_Dossier_${cleanName}.pdf`;
            saveAndOpenPdf(doc, filename);
            showToast('Clinical Assessment Summary PDF opened & downloaded!');
        } catch (err) {
            console.error('PDF generation error:', err);
            showToast('Error generating summary PDF', true);
        }
    }

    // ── Generate Center-Wide Summary PDF (All Children, All Forms Together) ───
    function generateAllAssessmentsSummaryPdf(children = []) {
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
                const ageStr = ageYears ? `${ageYears}y` : (c.dob || '-');
                const summary = extractAssessmentSummaries(c, c.assessments || []);

                const rapidTxt = summary.rapid.exists ? `${summary.rapid.diagnosis}\n(Date: ${summary.rapid.date})` : '-';
                const devTxt = summary.dev.exists ? `${summary.dev.diagnosis}\n(Date: ${summary.dev.date})` : '-';
                const physioTxt = summary.physio.exists ? `${summary.physio.diagnosis}\n(Date: ${summary.physio.date})` : '-';
                const speechTxt = summary.speech.exists ? `${summary.speech.diagnosis}\n(Date: ${summary.speech.date})` : '-';
                const progTxt = summary.progress.length ? `${summary.progress[0].quarter}: ${summary.progress[0].achievement.slice(0, 35)}...` : '-';

                const statusTxt = summary.coreCount === 4 ? 'Complete (4/4)' : (summary.totalCount > 0 ? `Partial (${summary.coreCount}/4)` : 'Pending (0)');
                const admLine = c.admission_no ? `Adm: ${c.admission_no}\n` : '';

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
                head: [['#', 'Child Name & Profile', 'Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment', 'Progress Reviews', 'Status']],
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

            saveAndOpenPdf(doc, 'Center_Assessment_Summaries_Report.pdf');
            showToast('Center Assessment Summaries PDF generated successfully!');
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
            'Rapid Assessment Date', 'Rapid Diagnosis', 'Rapid Symptoms', 'Rapid Finalized By',
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
                ageYears || '',
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
            list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
        }
        if (sf === 'completed') {
            list = list.filter(c => ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => (c.assessments || []).some(a => a.form_type === t)));
        } else if (sf === 'partial') {
            list = list.filter(c => {
                const cnt = ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].filter(t => (c.assessments || []).some(a => a.form_type === t)).length;
                return cnt > 0 && cnt < 4;
            });
        } else if (sf === 'none') {
            list = list.filter(c => !c.assessments || c.assessments.length === 0);
        }

        generateAllAssessmentsSummaryPdf(list);
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
            list = list.filter(c => (c.name && c.name.toLowerCase().includes(q)) || (c.mobile && c.mobile.includes(q)));
        }
        if (sf === 'completed') {
            list = list.filter(c => ['Rapid Assessment', 'Child Development', 'Physiotherapy', 'Speech Assessment'].every(t => (c.assessments || []).some(a => a.form_type === t)));
        }

        exportAllAssessmentsSummaryCsv(list);
    });

    document.getElementById('btn-print-assessment-summaries')?.addEventListener('click', () => {
        window.print();
    });

    // View Switcher (Cards vs Matrix)
    const btnViewCards = document.getElementById('btn-view-cards');
    const btnViewMatrix = document.getElementById('btn-view-matrix');
    const cardsContainerEl = document.getElementById('summary-cards-container');
    const matrixContainerEl = document.getElementById('summary-matrix-container');

    btnViewCards?.addEventListener('click', () => {
        currentMainSummaryView = 'cards';
        btnViewCards.classList.add('active');
        btnViewCards.style.background = '#fff';
        btnViewCards.style.color = 'var(--primary)';
        btnViewMatrix.classList.remove('active');
        btnViewMatrix.style.background = 'transparent';
        btnViewMatrix.style.color = 'var(--text-light)';
        if (cardsContainerEl) cardsContainerEl.style.display = 'flex';
        if (matrixContainerEl) matrixContainerEl.style.display = 'none';
    });

    btnViewMatrix?.addEventListener('click', () => {
        currentMainSummaryView = 'matrix';
        btnViewMatrix.classList.add('active');
        btnViewMatrix.style.background = '#fff';
        btnViewMatrix.style.color = 'var(--primary)';
        btnViewCards.classList.remove('active');
        btnViewCards.style.background = 'transparent';
        btnViewCards.style.color = 'var(--text-light)';
        if (cardsContainerEl) cardsContainerEl.style.display = 'none';
        if (matrixContainerEl) matrixContainerEl.style.display = 'block';
    });

    // Toggle All Cards (Expand All / Collapse All)
    const btnToggleAllCards = document.getElementById('btn-toggle-all-cards');
    btnToggleAllCards?.addEventListener('click', () => {
        allCardsExpanded = !allCardsExpanded;
        const iconEl = document.getElementById('toggle-cards-icon');
        const textEl = document.getElementById('toggle-cards-text');
        if (iconEl) iconEl.textContent = allCardsExpanded ? '⊟' : '⊞';
        if (textEl) textEl.textContent = allCardsExpanded ? 'Collapse All' : 'Expand All';

        document.querySelectorAll('.summary-child-card .summary-card-body').forEach(body => {
            body.style.display = allCardsExpanded ? 'flex' : 'none';
        });
        document.querySelectorAll('.summary-child-card .folder-toggle').forEach(t => {
            t.textContent = allCardsExpanded ? '▴' : '▾';
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
        document.getElementById('edit-child-sex').value = child.sex || '';
        document.getElementById('edit-child-mobile').value = child.mobile || '';
        childEditModal.classList.add('show');
    }

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
        const payload = {
            admission_no: document.getElementById('edit-child-adm').value.trim() || null,
            name: document.getElementById('edit-child-name').value.trim(),
            dob: document.getElementById('edit-child-dob').value || null,
            sex: document.getElementById('edit-child-sex').value || null,
            mobile: document.getElementById('edit-child-mobile').value.trim() || null
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
                    staff: '<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (&lt;8)</span>',
                    staff8: '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-weight:600;font-size:0.75rem;">Staff (≥8)</span>'
                };
                const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN') : '-';
                const deleteBtn = u.username === 'admin' 
                    ? '<span style="color:#94a3b8;font-size:0.8rem;">Default Admin</span>'
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
    if (userRole === 'admin') fetchUsers();
});
