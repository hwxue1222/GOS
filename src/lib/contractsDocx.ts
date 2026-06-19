import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function escXml(s: string) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function replaceFirst(haystack: string, needle: string, replacement: string) {
  const i = haystack.indexOf(needle);
  if (i < 0) return haystack;
  return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
}

export type CorpServiceAgreementFields = {
  partyAName: string;
  partyAUen: string;
  partyAAddress: string;
  partyAContact: string;
  partyAEmail: string;
};

export async function renderCorpServiceAgreementPdf(input: {
  contractNo: string;
  dateYmd: string;
  fields: CorpServiceAgreementFields;
}) {
  const templatePath = path.join(process.cwd(), 'src', 'contracts', 'templates', 'corp_service_agreement.docx');
  const buf = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(buf);
  const xmlRaw = await zip.file('word/document.xml')?.async('string');
  if (!xmlRaw) throw new Error('TEMPLATE_INVALID');

  let xml = xmlRaw;

  const partyALabel = 'Party甲方：';
  const uenLabel = 'UEN公司注册号：';
  const addrLabel = 'Address联系地址：';
  const contactLabel = 'Contact联系电话：';
  const emailLabel = 'Email电邮地址：';

  xml = replaceFirst(
    xml,
    partyALabel,
    `甲方（公司名称） / Party A (Company Name): ${escXml(input.fields.partyAName)}`,
  );
  xml = replaceFirst(xml, uenLabel, `UEN公司注册号 / UEN Registration No.: ${escXml(input.fields.partyAUen)}`);
  xml = replaceFirst(xml, addrLabel, `联系地址 / Address: ${escXml(input.fields.partyAAddress)}`);
  xml = replaceFirst(xml, contactLabel, `联系电话 / Contact Number: ${escXml(input.fields.partyAContact)}`);
  xml = replaceFirst(xml, emailLabel, `电邮地址 / Email: ${escXml(input.fields.partyAEmail)}`);

  xml = replaceFirst(xml, 'Contract No:', `合同编号 / Contract No: ${escXml(input.contractNo)}`);
  xml = replaceFirst(xml, '签字时间:', `签字时间 / Date: ${escXml(input.dateYmd)}`);

  zip.file('word/document.xml', xml);
  const filledDocx = await zip.generateAsync({ type: 'nodebuffer' });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gos-contract-'));
  const docxPath = path.join(tmpDir, `contract-${Date.now()}.docx`);
  await fs.writeFile(docxPath, filledDocx);

  try {
    await execFileAsync(
      'soffice',
      ['--headless', '--norestore', '--nolockcheck', '--convert-to', 'pdf', '--outdir', tmpDir, docxPath],
      { timeout: 120_000 },
    );
    const pdfPath = docxPath.replace(/\.docx$/i, '.pdf');
    const pdf = await fs.readFile(pdfPath);
    return pdf;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => null);
  }
}

