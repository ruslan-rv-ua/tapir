/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Shortcuts_Group_NavigationInputs */

const uk_shortcuts_group_navigation = /** @type {(inputs: Shortcuts_Group_NavigationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Навігація`)
};

const en_shortcuts_group_navigation = /** @type {(inputs: Shortcuts_Group_NavigationInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Navigation`)
};

/**
* | output |
* | --- |
* | "Navigation" |
*
* @param {Shortcuts_Group_NavigationInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const shortcuts_group_navigation = /** @type {((inputs?: Shortcuts_Group_NavigationInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Shortcuts_Group_NavigationInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_shortcuts_group_navigation(inputs)
	return en_shortcuts_group_navigation(inputs)
});