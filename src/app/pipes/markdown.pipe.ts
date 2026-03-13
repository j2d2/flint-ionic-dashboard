import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

/**
 * markdownHtml — converts a markdown string to sanitized HTML.
 * Uses Angular's DomSanitizer.sanitize() so XSS vectors are stripped
 * while safe formatting tags (h1-h6, bold, italic, code, links) pass through.
 * Vault docs are local trusted content but we sanitize anyway for defence-in-depth.
 */
@Pipe({ name: 'markdownHtml', standalone: true })
export class MarkdownPipe implements PipeTransform {
  constructor(private readonly sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    const html = marked.parse(value, { async: false }) as string;
    return this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
  }
}
