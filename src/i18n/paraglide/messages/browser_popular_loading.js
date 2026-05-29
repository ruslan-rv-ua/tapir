/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Popular_LoadingInputs */

const uk_browser_popular_loading = /** @type {(inputs: Browser_Popular_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Завантаження популярних станцій...`)
};

const en_browser_popular_loading = /** @type {(inputs: Browser_Popular_LoadingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Loading popular stations...`)
};

/**
* | output |
* | --- |
* | "Loading popular stations..." |
*
* @param {Browser_Popular_LoadingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_popular_loading = /** @type {((inputs?: Browser_Popular_LoadingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Popular_LoadingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_popular_loading(inputs)
	return en_browser_popular_loading(inputs)
});