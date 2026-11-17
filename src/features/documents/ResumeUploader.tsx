import { DocumentUploader, type DocumentUploaderProps } from './DocumentUploader'

/**
 * Resume-specific wrapper around {@link DocumentUploader}. V1 ships with
 * resume only; the generic uploader takes the document type explicitly so
 * a CoverLetterUploader can be added later without changing the hook.
 */
export function ResumeUploader(
  props: Omit<DocumentUploaderProps, 'documentType'>
) {
  return <DocumentUploader {...props} documentType="RESUME" />
}
