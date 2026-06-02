/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Context_MenuInputs */

const uk_profile_context_menu = /** @type {(inputs: Profile_Context_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Контекстне меню профілю`)
};

const en_profile_context_menu = /** @type {(inputs: Profile_Context_MenuInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile context menu`)
};

/**
* | output |
* | --- |
* | "Profile context menu" |
*
* @param {Profile_Context_MenuInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_context_menu = /** @type {((inputs?: Profile_Context_MenuInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Context_MenuInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_context_menu(inputs)
	return en_profile_context_menu(inputs)
});