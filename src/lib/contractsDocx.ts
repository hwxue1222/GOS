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

type TextNode = {
  start: number;
  end: number;
  attrs: string;
  text: string;
};

function parseTextNodes(xml: string): TextNode[] {
  const out: TextNode[] = [];
  const re = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push({ start: m.index, end: re.lastIndex, attrs: m[1] ?? '', text: m[2] ?? '' });
  }
  return out;
}

function rebuildXmlWithTextNodes(xml: string, nodes: TextNode[]) {
  let out = '';
  let last = 0;
  for (const n of nodes) {
    out += xml.slice(last, n.start);
    out += `<w:t${n.attrs}>${n.text}</w:t>`;
    last = n.end;
  }
  out += xml.slice(last);
  return out;
}

function findSeqIndex(nodes: TextNode[], seq: string[], fromIdx: number) {
  for (let i = fromIdx; i <= nodes.length - seq.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) {
      if (nodes[i + j].text !== seq[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
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
  const templatePath = path.join(process.cwd(), 'public', 'contracts', 'corp_service_agreement.docx');
  const buf = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(buf);
  const xmlRaw = await zip.file('word/document.xml')?.async('string');
  if (!xmlRaw) throw new Error('TEMPLATE_INVALID');

  const nodes = parseTextNodes(xmlRaw);

  const setText = (idx: number, v: string) => {
    nodes[idx].text = escXml(v);
  };

  let cursor = 0;

  const titleIdx = findSeqIndex(nodes, ['S', 'ervice ', 'Agreement', '公司秘书服务', '协议'], cursor);
  if (titleIdx >= 0) {
    setText(titleIdx + 0, '');
    setText(titleIdx + 1, '');
    setText(titleIdx + 2, '');
    setText(titleIdx + 3, '公司秘书服务协议 / ');
    setText(titleIdx + 4, 'Service Agreement');
    cursor = titleIdx + 5;
  }

  const partyAIdx = findSeqIndex(nodes, ['Party', '甲方：'], cursor);
  if (partyAIdx >= 0) {
    setText(partyAIdx + 0, '');
    setText(partyAIdx + 1, `甲方（公司名称） / Party A (Company Name): ${input.fields.partyAName}`);
    cursor = partyAIdx + 2;
  }

  const uenIdx = findSeqIndex(nodes, ['UEN', '公司注册号', '：', 'Address'], cursor);
  if (uenIdx >= 0) {
    setText(uenIdx + 0, '');
    setText(uenIdx + 1, `UEN公司注册号 / UEN Registration No.: ${input.fields.partyAUen}`);
    setText(uenIdx + 2, '');
    cursor = uenIdx + 3;
  }

  const addrIdx = findSeqIndex(nodes, ['Address', '联系地址：'], cursor);
  if (addrIdx >= 0) {
    setText(addrIdx + 0, '');
    setText(addrIdx + 1, `联系地址 / Address: ${input.fields.partyAAddress}`);
    cursor = addrIdx + 2;
  }

  const contactIdx = findSeqIndex(nodes, ['Contact', '联系电话：'], cursor);
  if (contactIdx >= 0) {
    setText(contactIdx + 0, '');
    setText(contactIdx + 1, `联系电话 / Contact Number: ${input.fields.partyAContact}`);
    cursor = contactIdx + 2;
  }

  const emailIdx = findSeqIndex(nodes, ['Email', '电邮地址：'], cursor);
  if (emailIdx >= 0) {
    setText(emailIdx + 0, '');
    setText(emailIdx + 1, `电邮地址 / Email: ${input.fields.partyAEmail}`);
    cursor = emailIdx + 2;
  }

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].text === 'Contract No:') {
      setText(i, `合同编号 / Contract No: ${input.contractNo}`);
      break;
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].text === '签字时间:') {
      setText(i, `签字时间 / Date: ${input.dateYmd}`);
      break;
    }
  }

  const xml = rebuildXmlWithTextNodes(xmlRaw, nodes);

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
