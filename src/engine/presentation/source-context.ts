const ANDROID_RESOURCE_PATH_REGEX =
  /\/res\/(?:color|drawable|mipmap|values)(?:-[^/]+)?\/[^/?#]+\.xml(?:[?#]|$)/iu

/** Whether a document is an Android XML resource with alpha-first HEX colors. */
export function isAndroidResourceXml(
  languageId: string,
  filePath?: string,
): boolean {
  return (
    languageId === 'xml' &&
    Boolean(filePath && ANDROID_RESOURCE_PATH_REGEX.test(filePath))
  )
}
