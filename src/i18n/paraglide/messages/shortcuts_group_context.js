/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Group_ContextInputs */

const uk_shortcuts_group_context = /** @type {(inputs: Shortcuts_Group_ContextInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Контекстні`)
};

const en_shortcuts_group_context = /** @type {(inputs: Shortcuts_Group_ContextInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Context`)
};

/**
* | output |
* | --- |
* | "Context" |
*
* @param {Shortcuts_Group_ContextInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_group_context = /** @type {((inputs?: Shortcuts_Group_ContextInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Group_ContextInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_group_context(inputs)
	return en_shortcuts_group_context(inputs)
});