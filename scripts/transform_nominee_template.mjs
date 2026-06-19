import fs from 'node:fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: node scripts/transform_nominee_template.mjs <input.html> <output.html>');
  process.exit(1);
}

let html = fs.readFileSync(inputPath, 'utf8');

html = html.replace(/^<!DOCTYPE[\s\S]*?<html>/i, '<!doctype html>\n<html>');
html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>Nominee Services Indemnity Agreement</title>');

html = html.replace(
  /<span class="s4">XXX([\s\S]*?)<\/span>/,
  '<span class="s4">{{company}}$1</span>',
);

html = html.replace(
  /<p class="p15">[\s\S]*?<\/p>/,
  '<p class="p15"><b>Dated this </b><span class="s4">{{dated}}</span></p>',
);

html = html.replace(/<span class="s7">XXXX<\/span>/g, '<span class="s7">{{principal_name}}</span>');

function replaceCompanySignatureBlock(block) {
  let out = block;
  out = out.replace(
    /(<tr>[\s\S]*?<p class="p16">Signature of authorized signatory:[\s\S]*?<\/td>\s*<td[^>]*>\s*)<p class="p18"><br><\/p>/i,
    '$1<p class="p18">{{company_auth_signature}}</p>',
  );
  out = out.replace(
    /(<p class="p19">Name:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p18"><br><\/p>/i,
    '$1<p class="p18">{{company_auth_name}}</p>',
  );
  out = out.replace(
    /(<p class="p16">NRIC\/Passport number:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p18"><br><\/p>/i,
    '$1<p class="p18">{{company_auth_nric}}</p>',
  );
  out = out.replace(
    /(<p class="p16">Designation:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p18"><br><\/p>/i,
    '$1<p class="p18">{{company_auth_designation}}</p>',
  );
  out = out.replace(
    /(<p class="p19">Date:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p18"><br><\/p>/i,
    '$1<p class="p18">{{company_auth_date}}</p>',
  );
  return out;
}

function replacePrincipalSignatureBlock(block) {
  let out = block;
  out = out.replace(
    /(<tr>[\s\S]*?<p class="p16">[\s\S]*?Signature of authorized signatory:[\s\S]*?<\/td>\s*<td[^>]*>\s*)<p class="p21"><br><\/p>/i,
    '$1<p class="p21">{{principal_auth_signature}}</p>',
  );
  out = out.replace(
    /(<p class="p19">Name:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p21"><br><\/p>/i,
    '$1<p class="p21">{{principal_auth_name}}</p>',
  );
  out = out.replace(
    /(<p class="p16">NRIC\/Passport number:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p21"><br><\/p>/i,
    '$1<p class="p21">{{principal_auth_nric}}</p>',
  );
  out = out.replace(
    /(<p class="p16">Designation:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p21"><br><\/p>/i,
    '$1<p class="p21">{{principal_auth_designation}}</p>',
  );
  out = out.replace(
    /(<p class="p19">Date:<\/p>[\s\S]*?<td[^>]*>\s*)<p class="p21"><br><\/p>/i,
    '$1<p class="p21">{{principal_auth_date}}</p>',
  );
  return out;
}

html = html.replace(
  /(<p class="p3">For and on behalf of the Company:<\/p>[\s\S]*?<\/table>)/i,
  (m) => replaceCompanySignatureBlock(m),
);

html = html.replace(
  /(<p class="p20">For and on behalf of the Principal:<\/p>[\s\S]*?<\/table>)/i,
  (m) => replacePrincipalSignatureBlock(m),
);

html = html.replace(
  /<p class="p16">Signature:<\/p>\s*<p class="p23"><br><\/p>/i,
  '<p class="p16">Signature:</p><p class="p23">{{principal_decl_signature}}</p>',
);

html = html.replace(
  /<p class="p16">Name:<span class="s5"><br>[\s\S]*?<\/span>ID:<\/p>/i,
  '<p class="p16">Name: {{principal_decl_name}}</p><p class="p16">NRIC/Passport number: {{principal_decl_nric}}</p>',
);

html = html.replace(
  /NRIC\/Passport number: \{\{principal_decl_nric\}\}<\/p>\s*<p class="p16">Designation:<\/p>/i,
  'NRIC/Passport number: {{principal_decl_nric}}</p><p class="p16">Designation: {{principal_decl_designation}}</p>',
);

html = html.replace(
  /Designation: \{\{principal_decl_designation\}\}<\/p>\s*<p class="p16">Date:<\/p>/i,
  'Designation: {{principal_decl_designation}}</p><p class="p16">Date: {{principal_decl_date}}</p>',
);

fs.writeFileSync(outputPath, html);
