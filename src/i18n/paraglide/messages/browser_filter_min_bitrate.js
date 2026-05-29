/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Filter_Min_BitrateInputs */

const uk_browser_filter_min_bitrate = /** @type {(inputs: Browser_Filter_Min_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Мін. бітрейт (кбіт/с)`)
};

const en_browser_filter_min_bitrate = /** @type {(inputs: Browser_Filter_Min_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Min bitrate (kbps)`)
};

/**
* | output |
* | --- |
* | "Min bitrate (kbps)" |
*
* @param {Browser_Filter_Min_BitrateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_filter_min_bitrate = /** @type {((inputs?: Browser_Filter_Min_BitrateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Filter_Min_BitrateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_filter_min_bitrate(inputs)
	return en_browser_filter_min_bitrate(inputs)
});