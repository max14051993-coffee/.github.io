export const GOOGLE_FORM_CONFIG = {
  enabled: false,
  /**
   * URL of the Google Form "viewform" page with prefill support.
   * Example: "https://docs.google.com/forms/d/e/.../viewform"
   */
  prefillBaseUrl: '',
  /**
   * Map internal field keys to Google Form entry IDs.
   * Fill the entry IDs from the Google Form prefilled URL parameters.
   */
  entryMap: {
    coffeeName: '',
    roasterName: '',
    country: '',
    region: '',
    farm: '',
    process: '',
    brewMethod: '',
    notes: '',
    rawText: '',
  },
  /**
   * Additional static parameters appended to the prefill URL.
   * Example: { usp: 'pp_url' }
   */
  extraParams: {
    usp: 'pp_url',
  },
};
