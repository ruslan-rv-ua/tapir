/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Zone_Profiles_ListInputs */

const uk_zone_profiles_list = /** @type {(inputs: Zone_Profiles_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Список профілів`)
};

const en_zone_profiles_list = /** @type {(inputs: Zone_Profiles_ListInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Profiles list`)
};

/**
* | output |
* | --- |
* | "Profiles list" |
*
* @param {Zone_Profiles_ListInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const zone_profiles_list = /** @type {((inputs?: Zone_Profiles_ListInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Zone_Profiles_ListInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_zone_profiles_list(inputs)
	return en_zone_profiles_list(inputs)
});