/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Api_UnavailableInputs */

const uk_browser_api_unavailable = /** @type {(inputs: Browser_Api_UnavailableInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Сервіс Radio Browser недоступний. Спробуйте пізніше.`)
};

const en_browser_api_unavailable = /** @type {(inputs: Browser_Api_UnavailableInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Radio Browser service is unavailable. Please try again later.`)
};

/**
* | output |
* | --- |
* | "Radio Browser service is unavailable. Please try again later." |
*
* @param {Browser_Api_UnavailableInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_api_unavailable = /** @type {((inputs?: Browser_Api_UnavailableInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Api_UnavailableInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_api_unavailable(inputs)
	return en_browser_api_unavailable(inputs)
});