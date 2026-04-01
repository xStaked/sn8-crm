import React from 'react';
import type { QuotePdfDocumentModel } from '../quote-pdf.mapper';

type RendererComponent = React.ComponentType<Record<string, unknown>>;

export type QuotePdfRendererPrimitives = {
  Document: RendererComponent;
  Page: RendererComponent;
  Text: RendererComponent;
  View: RendererComponent;
  StyleSheet: {
    create: (styles: Record<string, unknown>) => Record<string, unknown>;
  };
};

type QuotePdfDocumentProps = {
  renderer: QuotePdfRendererPrimitives;
  document: QuotePdfDocumentModel;
};

const h = React.createElement;

export function QuotePdfDocument({
  renderer,
  document,
}: QuotePdfDocumentProps): React.ReactElement {
  const { Document, Page, Text, View, StyleSheet } = renderer;
  const styles = StyleSheet.create({
    page: {
      paddingTop: 40,
      paddingBottom: 32,
      paddingHorizontal: 36,
      fontSize: 10,
      color: '#111827',
      fontFamily: 'Helvetica',
      backgroundColor: '#ffffff',
    },
    header: {
      marginBottom: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#d1d5db',
    },
    brand: {
      fontSize: 11,
      color: '#4b5563',
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 1.4,
    },
    title: {
      fontSize: 22,
      color: '#111827',
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 12,
      color: '#1f2937',
      marginBottom: 8,
    },
    version: {
      fontSize: 10,
      color: '#4b5563',
    },
    metaGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 18,
    },
    metaCard: {
      flexGrow: 1,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderRadius: 4,
      padding: 10,
      backgroundColor: '#f9fafb',
    },
    metaLabel: {
      fontSize: 8,
      color: '#6b7280',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    metaValue: {
      fontSize: 11,
      color: '#111827',
    },
    block: {
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#f3f4f6',
    },
    blockTitle: {
      fontSize: 12,
      color: '#111827',
      marginBottom: 8,
    },
    bodyText: {
      fontSize: 10,
      color: '#1f2937',
      lineHeight: 1.5,
    },
    section: {
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 11,
      color: '#111827',
      marginBottom: 4,
    },
    pricingBox: {
      borderWidth: 1,
      borderColor: '#111827',
      padding: 12,
      marginBottom: 16,
    },
    pricingTitle: {
      fontSize: 8,
      color: '#6b7280',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    pricingValue: {
      fontSize: 13,
      color: '#111827',
      lineHeight: 1.4,
    },
    reviewNotice: {
      backgroundColor: '#f3f4f6',
      padding: 12,
      marginBottom: 18,
      borderRadius: 4,
    },
    footer: {
      marginTop: 18,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#d1d5db',
    },
    footerLine: {
      fontSize: 8,
      color: '#4b5563',
      marginBottom: 4,
      lineHeight: 1.4,
    },
  });

  return h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: styles.page },
      h(
        View,
        { style: styles.header },
        h(Text, { style: styles.brand }, 'SN8 Labs'),
        h(Text, { style: styles.title }, document.documentTitle),
        h(Text, { style: styles.subtitle }, document.quoteTitle),
        h(
          Text,
          { style: styles.version },
          `${document.versionLabel} · Generado ${document.generatedAtLabel}`,
        ),
      ),
      h(
        View,
        { style: styles.metaGrid },
        h(
          View,
          { style: styles.metaCard },
          h(Text, { style: styles.metaLabel }, 'Cliente'),
          h(Text, { style: styles.metaValue }, document.customerLabel),
        ),
        h(
          View,
          { style: styles.metaCard },
          h(Text, { style: styles.metaLabel }, 'Proyecto'),
          h(Text, { style: styles.metaValue }, document.projectLabel),
        ),
      ),
      h(
        View,
        { style: styles.block },
        h(Text, { style: styles.blockTitle }, document.summaryLabel),
        h(Text, { style: styles.bodyText }, document.projectSummary),
      ),
      ...document.sections.map((section, index) =>
        h(
          View,
          { style: styles.section, key: `${section.label}-${index}` },
          h(Text, { style: styles.sectionTitle }, section.label),
          h(Text, { style: styles.bodyText }, section.content),
        ),
      ),
      h(
        View,
        { style: styles.pricingBox },
        h(Text, { style: styles.pricingTitle }, document.pricingLabel),
        h(Text, { style: styles.pricingValue }, document.pricingSummary),
      ),
      h(
        View,
        { style: styles.reviewNotice },
        h(Text, { style: styles.bodyText }, document.reviewStatusLabel),
      ),
      h(
        View,
        { style: styles.footer },
        ...document.footerLines.map((line, index) =>
          h(Text, { style: styles.footerLine, key: `footer-${index}` }, line),
        ),
      ),
    ),
  );
}
