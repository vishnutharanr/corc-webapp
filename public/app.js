document.addEventListener('DOMContentLoaded', () => {

    // ── State ────────────────────────────────────────────────
    let activeChild = JSON.parse(localStorage.getItem('activeChild') || 'null');

    // ── Navigation ───────────────────────────────────────────
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.assessment-pane').forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            const tid = item.getAttribute('data-target');
            document.getElementById(tid).classList.add('active');
            if (tid === 'records') fetchChildFolders();
        });
    });

    function switchTab(targetId) {
        navItems.forEach(n => n.classList.toggle('active', n.getAttribute('data-target') === targetId));
        tabContents.forEach(t => t.classList.toggle('active', t.id === targetId));
        document.querySelectorAll('.assessment-pane').forEach(p => p.classList.toggle('active', p.id === targetId));
        if (targetId === 'records') fetchChildFolders();
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
            bannerName.textContent = activeChild.name;
            // Show meta details from child profile + rapid assessment data
            const rd = activeChild._rapidData || {};
            const metaParts = [];
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

        // ── Auto-fill Child Development form from Rapid Assessment data ──
        if (!activeChild) return;
        const devForm = document.getElementById('form-development');
        if (!devForm) return;

        // Map: [CSS selector, value]  — only fills if value is non-empty
        const fills = [
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
    function calcAge(dobValue) {
        if (!dobValue) return '';
        const birth = new Date(dobValue);
        if (isNaN(birth)) return '';
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
        try {
            // 1. Create child profile
            const cr = await fetch('/api/children', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, dob: data.dob || null, sex: data.sex || null, mobile: data.mobile || null })
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
            const children = await (await fetch(url)).json();
            foldersEl.innerHTML = '';

            if (!children.length) {
                foldersEl.innerHTML = '<div class="empty-folders"><span style="font-size:3rem">\ud83d\udcc2</span><p>No child profiles found. Submit a Rapid Assessment to create one.</p></div>';
                return;
            }

            children.forEach(child => {
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

                const childJson    = JSON.stringify({id:child.id, name:child.name, dob:child.dob, sex:child.sex, mobile:child.mobile});
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
                const meta = [child.sex, child.dob ? 'DOB: '+child.dob : '', child.mobile ? '\ud83d\udcf1 '+child.mobile : '', child.assessments.length + ' assessment(s)'].filter(Boolean).join(' \u00b7 ');
                card.innerHTML =
                    '<div class="folder-header" data-child-id="' + child.id + '">' +
                        '<div class="folder-title">' +
                            '<span class="folder-icon">' + (isActive ? '\ud83d\udcc2' : '\ud83d\udcc1') + '</span>' +
                            '<div>' +
                                '<strong class="folder-child-name">' + child.name + '</strong>' +
                                '<small class="folder-meta">' + meta + '</small>' +
                            '</div>' +
                        '</div>' +
                        '<div class="folder-actions">' + openBtn + '<button class="btn-delete-folder" data-id="' + child.id + '" data-name="' + child.name.replace(/"/g, '&quot;') + '" title="Delete Folder">&#128465;</button><span class="folder-toggle">\u25be</span></div>' +
                    '</div>' +
                    '<div class="folder-body">' +
                        rows +
                        '<div class="folder-form-links" style="margin-top: 15px;">' +
                            '<span class="folder-form-links-label">Add Assessment:</span> ' +
                            formBtns +
                        '</div>' +
                        '<div class="folder-form-links" style="margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px;">' +
                            '<span class="folder-form-links-label">Attendance:</span> ' +
                            '<button class="btn-log-therapy btn-blue btn-sm" data-child-json="' + safeChildJson + '">⏱️ Log Therapy</button>' +
                            '<button class="btn-view-attendance btn-secondary btn-sm" data-child-id="' + child.id + '" style="margin-left: 8px;">📊 View History</button>' +
                        '</div>' +
                    '</div>';

                foldersEl.appendChild(card);
            });

            // Events
            foldersEl.querySelectorAll('.folder-header').forEach(h => {
                h.addEventListener('click', e => {
                    if (e.target.classList.contains('btn-open-folder') ||
                        e.target.classList.contains('btn-view-sm')      ||
                        e.target.classList.contains('btn-edit-sm')      ||
                        e.target.classList.contains('btn-delete-sm')    ||
                        e.target.classList.contains('btn-delete-folder')||
                        e.target.closest('.btn-delete-folder')          ||
                        e.target.classList.contains('btn-form-link')    ||
                        e.target.classList.contains('btn-log-therapy')) return;
                    const c = h.closest('.child-folder-card');
                    c.classList.toggle('folder-open');
                    h.querySelector('.folder-toggle').textContent = c.classList.contains('folder-open') ? '\u25b4' : '\u25be';
                });
            });

            foldersEl.querySelectorAll('.btn-open-folder').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.stopPropagation();
                    const cd = JSON.parse(btn.getAttribute('data-child-json').replace(/&quot;/g, '"'));
                    setActiveChild(cd);
                    showToast('"' + cd.name + '" is now the active profile.');
                    fetchChildFolders(q);
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
                                fetchChildFolders(q);
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

    async function viewRecord(id) {
        try {
            const r = await fetch('/api/assessments/' + id);
            if (!r.ok) { showToast('Failed to fetch record', true); return; }
            const rec  = await r.json();
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
        document.getElementById('log-therapy-date').value = new Date().toISOString().split('T')[0];
        typeSelect.value = '';
        document.getElementById('log-therapy-sub-therapy').value = '';
        orthoticGroup.style.display = 'none';
        therapistSelect.value = '';
        feeInput.value = 0;
        concessionInput.value = 0;
        toBePaidInput.value = 0;
        paidInput.value = 0;
        balanceInput.value = 0;
        document.getElementById('log-therapy-time-slot').value = '';
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
                notes: document.getElementById('log-therapy-notes').value
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
            const children = await (await fetch('/api/children')).json();
            
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

    const reportChildSelect = document.getElementById('report-child-select');
    if (reportChildSelect) {
        reportChildSelect.addEventListener('change', fetchReports);
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
                    tr.querySelector('[data-field="balance"]').value = balance;
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
                        body: JSON.stringify({ fee, concession, paid, balance })
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
                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">No therapy records found for this period.</td></tr>';
                return;
            }

            let sumFee = 0, sumConcession = 0, sumPaid = 0, sumBalance = 0;
            let html = '';

            // Group data by child
            const grouped = {};
            data.forEach(row => {
                if (!grouped[row.child_id]) {
                    grouped[row.child_id] = { 
                        name: row.child_name, 
                        rows: [], 
                        sumFee: 0, sumConcession: 0, sumPaid: 0, sumBalance: 0 
                    };
                }
                grouped[row.child_id].rows.push(row);
                grouped[row.child_id].sumFee += row.fee || 0;
                grouped[row.child_id].sumConcession += row.concession || 0;
                grouped[row.child_id].sumPaid += row.paid || 0;
                grouped[row.child_id].sumBalance += row.balance || 0;
            });

            Object.values(grouped).forEach((group, index) => {
                sumFee += group.sumFee;
                sumConcession += group.sumConcession;
                sumPaid += group.sumPaid;
                sumBalance += group.sumBalance;
                
                // Header row
                html += `<tr class="accordion-header" data-child-index="${index}" style="cursor: pointer; background: #f8fafc;">
                    <td colspan="5"><strong><span class="toggle-icon">▼</span> ${group.name}</strong> <span style="color: #64748b; font-size: 0.9em; margin-left: 10px;">(${group.rows.length} session${group.rows.length > 1 ? 's' : ''})</span></td>
                    <td class="header-fee"><strong>${group.sumFee}</strong></td>
                    <td class="header-concession"><strong>${group.sumConcession}</strong></td>
                    <td class="header-paid"><strong>${group.sumPaid}</strong></td>
                    <td class="header-balance" style="${group.sumBalance > 0 ? 'color: var(--danger);' : ''}"><strong>${group.sumBalance}</strong></td>
                    <td></td>
                </tr>`;

                // Detail rows
                group.rows.forEach(row => {
                    const therapyDisplay = row.sub_therapy 
                        ? `${row.therapy_type}<br><small style="color:gray;">${row.sub_therapy}</small>`
                        : row.therapy_type;

                    html += `<tr class="accordion-content accordion-child-${index}" style="display: none; background: #fff;" data-attendance-id="${row.id}">
                        <td>${new Date(row.date).toLocaleDateString()}</td>
                        <td style="color: #cbd5e1; text-align: center;">&#8627;</td>
                        <td>${row.time_slot || '-'}</td>
                        <td>${therapyDisplay}</td>
                        <td>${row.therapist_name || '-'}</td>
                        <td><input type="number" class="edit-attendance" data-field="fee" value="${row.fee || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td><input type="number" class="edit-attendance" data-field="concession" value="${row.concession || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td><input type="number" class="edit-attendance" data-field="paid" value="${row.paid || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td><input type="number" class="edit-attendance" data-field="balance" value="${row.balance || 0}" style="width: 70px; padding: 2px 5px; border: 1px solid #ccc; border-radius: 4px;"></td>
                        <td style="text-align: center;"><button type="button" class="btn-delete-attendance" data-id="${row.id}" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 1.1rem;" title="Delete Session">🗑️</button></td>
                    </tr>`;
                });

                // Child-specific Totals row at the bottom of their folder
                html += `<tr class="accordion-content accordion-child-${index} footer-row" style="display: none; background: #f8fafc; font-weight: bold;">
                    <td colspan="5" style="text-align: right;">TOTALS:</td>
                    <td class="footer-fee">${group.sumFee}</td>
                    <td class="footer-concession">${group.sumConcession}</td>
                    <td class="footer-paid">${group.sumPaid}</td>
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

            updateAttendanceGraph(data);


        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: red;">Failed to load reports.</td></tr>';
        }
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

    function updateAttendanceGraph(data) {
        const ctx = document.getElementById('attendanceChart');
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
        }
    }

    const btnPrint = document.getElementById('btn-print-receipt');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            window.print();
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
        "2.30 - 3.00", "3.00 - 3.30", "3.30 - 4.00", "4.00 - 5.00"
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

        tbody.innerHTML = '<tr><td colspan="13" style="text-align: center;">Loading...</td></tr>';
        try {
            // Fetch children if not already loaded
            if (scheduleChildrenList.length === 0) {
                const respChild = await fetch('/api/children');
                scheduleChildrenList = await respChild.json();
                
                // Populate filter dropdown
                if (scheduleFilterInput) {
                    scheduleChildrenList.forEach(child => {
                        const opt = document.createElement('option');
                        opt.value = child.id;
                        opt.textContent = child.name;
                        scheduleFilterInput.appendChild(opt);
                    });
                }
            }

            // Fetch schedules for the date
            const respSched = await fetch(`/api/schedules?date=${encodeURIComponent(date)}`);
            currentScheduleData = await respSched.json();

            if (scheduleChildrenList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align: center;">No children registered.</td></tr>';
                return;
            }

            const filterChildId = scheduleFilterInput ? scheduleFilterInput.value : '';
            const filteredChildren = filterChildId 
                ? scheduleChildrenList.filter(c => c.id == filterChildId)
                : scheduleChildrenList;

            let html = '';
            filteredChildren.forEach((child, index) => {
                html += `<tr>`;
                html += `<td class="sticky-col">${index + 1}. ${child.name}</td>`;
                
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
            tbody.innerHTML = '<tr><td colspan="13" style="text-align: center; color: red;">Failed to load schedule.</td></tr>';
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

        const formattedDate = new Date(date).toLocaleDateString('en-GB');
        let message = `📅 Therapy Schedule for ${child.name}\n`;
        message += `🗓 Date: ${formattedDate}\n\n`;

        blocks.forEach(block => {
            message += `⏰ ${block.time_slot}\n`;
            message += `🔹 ${block.therapy_type} (${block.therapist_name || 'TBD'})\n\n`;
        });

        return { message: message.trim(), child };
    }

    document.getElementById('btn-share-schedule')?.addEventListener('click', () => {
        const data = getScheduleMessageAndChild();
        if (!data) return;

        navigator.clipboard.writeText(data.message).then(() => {
            showToast('Schedule copied to clipboard! You can now paste it.');
        }).catch(() => {
            showToast('Failed to copy. Please try again.', true);
        });
    });

    // ── Initial load ─────────────────────────────────────────
    fetchChildFolders(); // populate records on page load
    fetchTherapists(); // load therapists on load to populate dropdowns
});
