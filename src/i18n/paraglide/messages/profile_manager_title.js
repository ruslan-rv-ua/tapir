/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Manager_TitleInputs */

const uk_profile_manager_title = /** @type {(inputs: Profile_Manager_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Управління профілями`)
};

const en_profile_manager_title = /** @type {(inputs: Profile_Manager_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profile Manager`)
};

/**
* | output |
* | --- |
* | "Profile Manager" |
*
* @param {Profile_Manager_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_manager_title = /** @type {((inputs?: Profile_Manager_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Manager_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_manager_title(inputs)
	return en_profile_manager_title(inputs)
});