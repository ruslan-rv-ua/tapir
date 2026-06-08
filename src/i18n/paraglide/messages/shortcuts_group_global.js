/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Group_GlobalInputs */

const uk_shortcuts_group_global = /** @type {(inputs: Shortcuts_Group_GlobalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Глобальні`)
};

const en_shortcuts_group_global = /** @type {(inputs: Shortcuts_Group_GlobalInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Global`)
};

/**
* | output |
* | --- |
* | "Global" |
*
* @param {Shortcuts_Group_GlobalInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_group_global = /** @type {((inputs?: Shortcuts_Group_GlobalInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Group_GlobalInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_group_global(inputs)
	return en_shortcuts_group_global(inputs)
});