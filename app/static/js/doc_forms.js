// Document application form fields: ONE definition used by the resident "Request a Document" page (resident_tx.js)
// and by the staff "New document request" window (autofill.js), so both show the same fields in the same order.
(function () {
  var templates = {
    'Barangay Clearance': [
      ['Full Name','text','full_name','Type your complete name (first, middle, last)','wide'], ['Date of Birth','date','birth_date','',''],
      ['Complete Residential Address','textarea','complete_address','Enter house/lot no., street, purok or sitio, barangay, and city/municipality','wide'],
      ['Year or Date You Started Residing in the Barangay','text','residency_start','Enter the year you moved into the barangay (e.g., 2020)','wide'],
      ['Civil Status','radios','civil_status',['Single','Married','Widowed','Separated'],'wide'],
      ['Purpose of Request','select','purpose',['Employment','School enrollment','Identification','Financial assistance','Travel','Other lawful purpose','Others'],'wide'],
      ['Contact Number','tel','contact_number','Enter your 11-digit mobile number (e.g., 09171234567)','wide']
    ],
    'Business Permit': [
      ["Owner's Name",'text','owner_name',"Enter the business owner's complete name",'wide'], ['Business Name','text','business_name','Enter the official or proposed name of the business','wide'],
      ['Business Address','textarea','business_address','Enter the building/house no., street, purok/sitio, and barangay','wide'], ['Business Type','radios','business_type',['Sole Proprietorship','Partnership','Corporation','Other'],'wide'],
      ['Nature of Business','text','nature_of_business','Describe your business (e.g., sari-sari store, online shop)','wide'], ['Application Type','radios','application_type',['New Business','Renewal'],'wide'],
      ['Contact Number','tel','contact_number','Enter your 11-digit mobile number (e.g., 09171234567)','wide']
    ],
    'Business Permit Request': [
      ["Owner's Name",'text','owner_name',"Enter the business owner's complete name",'wide'], ['Business Name','text','business_name','Enter the official or proposed name of the business','wide'],
      ['Business Address','textarea','business_address','Enter the building/house no., street, purok/sitio, and barangay','wide'], ['Business Type','radios','business_type',['Sole Proprietorship','Partnership','Corporation','Other'],'wide'],
      ['Nature of Business','text','nature_of_business','Describe your business (e.g., sari-sari store, online shop)','wide'], ['Application Type','radios','application_type',['New Business','Renewal'],'wide'],
      ['Contact Number','tel','contact_number','Enter your 11-digit mobile number (e.g., 09171234567)','wide']
    ],
    'Certificate of Indigency': [
      ['Full Name','text','full_name','Type your complete name (first, middle, last)','wide'], ['Date of Birth','date','birth_date','',''],
      ['Complete Address','textarea','complete_address','Enter your complete current address, including barangay and city','wide'],
      ['Occupation / Employment Status','select','occupation',['Employed','Self-employed','Unemployed','Student','Senior Citizen','Other'],'wide'],
      ['Approximate Monthly Household Income (₱)','text','monthly_income','Enter estimated monthly household income in pesos (e.g., ₱8,000 or ₱5,000–₱10,000)','wide'], ['Number of Household Members','number','household_members','Enter the total number of people living in your household','wide'],
      ['Purpose of Request','select','purpose',['Financial assistance','Medical assistance','Educational assistance','Employment','Other lawful purpose','Others'],'wide'], ['Contact Number','tel','contact_number','Enter your 11-digit mobile number (e.g., 09171234567)','wide']
    ],
    'Certificate of Residency': [
      ['Full Name','text','full_name','Type your complete name (first, middle, last)','wide'], ['Date of Birth','date','birth_date','',''],
      ['Complete Residential Address','textarea','complete_address','Enter house/lot no., street, purok or sitio, barangay, and city/municipality','wide'],
      ['Year or Date You Started Residing in the Barangay','text','residency_start','Enter the year you moved into the barangay (e.g., 2020)','wide'],
      ['Civil Status','radios','civil_status',['Single','Married','Widowed','Separated'],'wide'],
      ['Purpose of Request','select','purpose',['Employment','School enrollment','Identification','Financial assistance','Travel','Other lawful purpose','Others'],'wide'], ['Contact Number','tel','contact_number','Enter your 11-digit mobile number (e.g., 09171234567)','wide']
    ]
  };

  // prefill: { name, address, contact, birth, civil }  -> values that are already known (all stay editable)
  function valueFor(name, prefill) {
    var p = prefill || {};
    if (name === 'full_name' || name === 'owner_name') return p.name || '';
    if (name === 'complete_address' || name === 'business_address') return p.address || '';
    if (name === 'contact_number') return p.contact || '';
    if (name === 'birth_date') return p.birth || '';
    return '';
  }

    function makeField(f, prefill, today) {
      var label = document.createElement('label'); label.className = f[4] || '';
      label.appendChild(document.createTextNode(f[0]));
      var el;
      if (f[1] === 'textarea') { el = document.createElement('textarea'); el.rows = 3; }
      else if (f[1] === 'select') { el = document.createElement('select'); el.appendChild(new Option('Choose your ' + f[0].toLowerCase(), '')); f[3].forEach(function(v){ el.appendChild(new Option(v,v)); }); }
      else if (f[1] === 'radios') {
        el = document.createElement('div'); el.className = 'radio-options';
        f[3].forEach(function(v){ var wrap=document.createElement('label'); wrap.className='radio-option'; var input=document.createElement('input'); input.type='radio'; input.name=f[2]; input.value=v; input.required=true; wrap.appendChild(input); wrap.appendChild(document.createTextNode(v)); el.appendChild(wrap); });
        label.appendChild(el); return label;
      } else { el = document.createElement('input'); el.type = f[1]; if (f[1] === 'date') { el.min='1900-01-01'; el.max=today || ''; } }
      el.name=f[2]; el.id='df_'+f[2]; el.required = !['monthly_income','residency_start'].includes(f[2]);
      if (f[3] && typeof f[3] === 'string') el.placeholder=f[3];
      el.value = valueFor(f[2], prefill);
      label.appendChild(el); return label;
    }
    // "Others" / "Other lawful purpose" on Purpose of Request: show a box so the resident can type the purpose
    function makePurposeOther(select) {
      var label = document.createElement('label'); label.className = 'wide'; label.hidden = true;
      label.appendChild(document.createTextNode('Please specify your purpose'));
      var input = document.createElement('input'); input.type = 'text'; input.name = 'purpose_other'; input.id = 'df_purpose_other';
      input.maxLength = 100; input.placeholder = 'Type your purpose (e.g., scholarship application)';
      label.appendChild(input);
      function sync() {
        var other = /^other/i.test(select.value);
        label.hidden = !other; input.required = other;
        if (!other) input.value = '';
        else input.focus();
      }
      select.addEventListener('change', sync);
      return label;
    }

  // Build the form for one document type into `box`. Returns true when the type has its own form.
  function render(box, serviceName, prefill, today) {
    var fields = templates[serviceName] || templates['Barangay Clearance'];
    box.innerHTML = '';
    fields.forEach(function (f) {
      var field = makeField(f, prefill, today);
      box.appendChild(field);
      if (f[2] === 'purpose') box.appendChild(makePurposeOther(field.querySelector('select')));
    });
    if (prefill && prefill.civil) setPrefill(box, prefill);       // preselect the civil status that is on record
  }

  // Fill what is known into a form that is already on screen (e.g. after staff picks a resident)
  function setPrefill(box, prefill) {
    box.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (el) {
      if (el.type === 'radio') {
        if (el.name === 'civil_status' && prefill && prefill.civil) el.checked = el.value.toLowerCase() === String(prefill.civil).toLowerCase();
        return;
      }
      var v = valueFor(el.name, prefill);
      if (v !== '' || el.name === 'full_name' || el.name === 'owner_name' || el.name === 'complete_address' || el.name === 'business_address' || el.name === 'contact_number' || el.name === 'birth_date') el.value = v;
    });
  }

  window.DocForms = { templates: templates, render: render, setPrefill: setPrefill };
})();
