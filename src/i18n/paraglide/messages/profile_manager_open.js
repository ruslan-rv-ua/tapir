/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Manager_OpenInputs */

const uk_profile_manager_open = /** @type {(inputs: Profile_Manager_OpenInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Управління профілями`)
};

const en_profile_manager_open = /** @type {(inputs: Profile_Manager_OpenInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Manage profiles`)
};

/**
* | output |
* | --- |
* | "Manage profiles" |
*
* @param {Profile_Manager_OpenInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_manager_open = /** @type {((inputs?: Profile_Manager_OpenInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Manager_OpenInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_manager_open(inputs)
	return en_profile_manager_open(inputs)
});