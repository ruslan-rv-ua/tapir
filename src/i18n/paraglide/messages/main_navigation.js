/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Main_NavigationInputs */

const uk_main_navigation = /** @type {(inputs: Main_NavigationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Головна навігація`)
};

const en_main_navigation = /** @type {(inputs: Main_NavigationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Main navigation`)
};

/**
* | output |
* | --- |
* | "Main navigation" |
*
* @param {Main_NavigationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const main_navigation = /** @type {((inputs?: Main_NavigationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Main_NavigationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_main_navigation(inputs)
	return en_main_navigation(inputs)
});