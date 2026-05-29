/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Add_To_IgnorelistInputs */

const uk_add_to_ignorelist = /** @type {(inputs: Add_To_IgnorelistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додати до ігнорованих`)
};

const en_add_to_ignorelist = /** @type {(inputs: Add_To_IgnorelistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Add to ignorelist`)
};

/**
* | output |
* | --- |
* | "Add to ignorelist" |
*
* @param {Add_To_IgnorelistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const add_to_ignorelist = /** @type {((inputs?: Add_To_IgnorelistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Add_To_IgnorelistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_add_to_ignorelist(inputs)
	return en_add_to_ignorelist(inputs)
});