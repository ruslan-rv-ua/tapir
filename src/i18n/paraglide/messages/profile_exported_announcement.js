/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Exported_AnnouncementInputs */

const uk_profile_exported_announcement = /** @type {(inputs: Profile_Exported_AnnouncementInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Профіль експортовано: ${i?.name}`)
};

const en_profile_exported_announcement = /** @type {(inputs: Profile_Exported_AnnouncementInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Profile exported: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Profile exported: {name}" |
*
* @param {Profile_Exported_AnnouncementInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_exported_announcement = /** @type {((inputs: Profile_Exported_AnnouncementInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Exported_AnnouncementInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_exported_announcement(inputs)
	return en_profile_exported_announcement(inputs)
});