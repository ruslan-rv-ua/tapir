/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Group_ListInputs */

const uk_shortcuts_group_list = /** @type {(inputs: Shortcuts_Group_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Списки`)
};

const en_shortcuts_group_list = /** @type {(inputs: Shortcuts_Group_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Lists`)
};

/**
* | output |
* | --- |
* | "Lists" |
*
* @param {Shortcuts_Group_ListInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_group_list = /** @type {((inputs?: Shortcuts_Group_ListInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Group_ListInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_group_list(inputs)
	return en_shortcuts_group_list(inputs)
});